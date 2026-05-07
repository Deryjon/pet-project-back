import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { CreateCashboxDto } from './dto/create-cashbox.dto';

@Injectable()
export class CashboxesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async create(dto: CreateCashboxDto, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const shop = await this.findAccessibleShop(dto.shopId, context);

    const cashbox = await this.prisma.cashbox.create({
      data: {
        companyId: context.companyId,
        shopId: shop.id,
        name: dto.name.trim(),
      },
      include: {
        shop: true,
      },
    });

    return this.toCashboxResponse(cashbox);
  }

  async findAll(shopId?: string, authorization?: string) {
    const context = await this.getCompanyContext(authorization);
    const normalizedShopId = shopId?.trim();

    if (normalizedShopId) {
      const shop = await this.findAccessibleShop(normalizedShopId, context);
      const cashboxes = await this.prisma.cashbox.findMany({
        where: {
          companyId: context.companyId,
          shopId: shop.id,
          isActive: true,
        },
        include: {
          shop: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      return cashboxes.map((cashbox) => this.toCashboxResponse(cashbox));
    }

    const cashboxes = await this.prisma.cashbox.findMany({
      where: {
        companyId: context.companyId,
        shopId: {
          in: context.allowedShopIds,
        },
        isActive: true,
      },
      include: {
        shop: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return cashboxes.map((cashbox) => this.toCashboxResponse(cashbox));
  }

  private async getCompanyContext(authorization?: string) {
    const context = await this.usersService.getRequestContext(authorization);
    if (context.userType !== 'company' || !context.companyId) {
      throw new ForbiddenException('Only company users can manage cashboxes');
    }

    if (!context.allowedShopIds.length) {
      throw new ForbiddenException('No available shops for this user');
    }

    return {
      companyId: context.companyId,
      userId: context.userId,
      allowedShopIds: context.allowedShopIds,
    };
  }

  private async findAccessibleShop(
    shopId: string,
    context: { companyId: string; allowedShopIds: string[] },
  ) {
    const normalizedShopId = shopId.trim();
    if (!normalizedShopId) {
      throw new BadRequestException('shopId is required');
    }

    const shop = await this.prisma.shop.findFirst({
      where: {
        companyId: context.companyId,
        OR: [{ id: normalizedShopId }, { branchCode: normalizedShopId }],
        isActive: true,
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (!context.allowedShopIds.includes(shop.id)) {
      throw new ForbiddenException('Shop is not available for this user');
    }

    return shop;
  }

  private toCashboxResponse(cashbox: {
    id: string;
    companyId: string;
    shopId: string;
    name: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
    shop?: { id: string; name: string; branchCode: string } | null;
  }) {
    return {
      id: cashbox.id,
      companyId: cashbox.companyId,
      shopId: cashbox.shopId,
      name: cashbox.name,
      isActive: cashbox.isActive,
      shop: cashbox.shop
        ? {
            id: cashbox.shop.id,
            name: cashbox.shop.name,
            branchCode: cashbox.shop.branchCode,
          }
        : null,
      createdAt: cashbox.createdAt,
      updatedAt: cashbox.updatedAt,
    };
  }
}
