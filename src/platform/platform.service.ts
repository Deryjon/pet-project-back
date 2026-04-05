import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma as any;
  }

  async createCompany(body: Record<string, unknown>) {
    const login = this.requireIdentifier(body.login, 'login');
    const name = this.requireString(body.name, 'name');
    const subdomain = this.requireIdentifier(
      body.subdomain ?? body.login,
      'subdomain',
    );

    const existing = await this.db.company.findFirst({
      where: {
        OR: [{ login }, { subdomain }],
      },
    });

    if (existing) {
      throw new BadRequestException('Company with this login already exists');
    }

    return this.db.company.create({
      data: {
        login,
        name,
        subdomain,
      },
    });
  }

  async findCompanies() {
    const companies = await this.db.company.findMany({
      include: {
        shops: {
          where: {
            isActive: true,
          },
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            shops: true,
            users: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return companies.map((company) => ({
      id: company.id,
      company_id: company.id,
      login: company.login,
      name: company.name,
      subdomain: company.subdomain,
      is_active: company.isActive,
      shops_count: company._count.shops,
      users_count: company._count.users,
      shops: company.shops.map((shop) => this.toShopItem(shop)),
      created_at: company.createdAt,
      updated_at: company.updatedAt,
    }));
  }

  async findCompany(companyId: string) {
    const company = await this.db.company.findUnique({
      where: { id: companyId },
      include: {
        shops: {
          orderBy: {
            name: 'asc',
          },
        },
        _count: {
          select: {
            shops: true,
            users: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return {
      id: company.id,
      company_id: company.id,
      login: company.login,
      name: company.name,
      subdomain: company.subdomain,
      is_active: company.isActive,
      shops_count: company._count.shops,
      users_count: company._count.users,
      shops: company.shops.map((shop) => this.toShopItem(shop)),
      created_at: company.createdAt,
      updated_at: company.updatedAt,
    };
  }

  async createShop(companyId: string, body: Record<string, unknown>) {
    const company = await this.db.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const name = this.requireString(body.name, 'name');
    const branchCode = this.requireIdentifier(body.branch_code, 'branch_code');

    const existing = await this.db.shop.findFirst({
      where: {
        companyId,
        branchCode,
      },
    });

    if (existing) {
      throw new BadRequestException(
        'Shop with this branch_code already exists in this company',
      );
    }

    return this.db.shop.create({
      data: {
        companyId,
        name,
        branchCode,
      },
    });
  }

  async findCompanyShops(companyId: string) {
    await this.findCompany(companyId);

    const shops = await this.db.shop.findMany({
      where: {
        companyId,
      },
      orderBy: {
        name: 'asc',
      },
    });

    return shops.map((shop) => this.toShopItem(shop));
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }

    return value.trim();
  }

  private requireIdentifier(value: unknown, field: string) {
    const normalized = this.requireString(value, field).toLowerCase();

    if (!/^[a-z0-9-_]+$/.test(normalized)) {
      throw new BadRequestException(
        `${field} must contain only lowercase latin letters, numbers, dash or underscore`,
      );
    }

    return normalized;
  }

  private toShopItem(shop: {
    id: string;
    companyId: string;
    name: string;
    branchCode: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: shop.id,
      shop_id: shop.id,
      company_id: shop.companyId,
      branch_code: shop.branchCode,
      is_active: shop.isActive,
      shop: {
        name: shop.name,
      },
      created_at: shop.createdAt,
      updated_at: shop.updatedAt,
    };
  }
}
