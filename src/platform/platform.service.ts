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

    const company = await this.db.company.create({
      data: {
        login,
        name,
        subdomain,
      },
    });

    return this.toCompanyItem({
      ...company,
      shops: [],
      _count: {
        shops: 0,
        users: 0,
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

    return this.toCompanyItem(company);
  }

  async updateCompany(companyId: string, body: Record<string, unknown>) {
    const company = await this.db.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const data: Record<string, unknown> = {};
    const nextLogin =
      body.login !== undefined
        ? this.requireIdentifier(body.login, 'login')
        : company.login;
    const nextSubdomain =
      body.subdomain !== undefined
        ? this.requireIdentifier(body.subdomain, 'subdomain')
        : company.subdomain;

    if (
      nextLogin !== company.login ||
      nextSubdomain !== company.subdomain
    ) {
      const existing = await this.db.company.findFirst({
        where: {
          id: {
            not: companyId,
          },
          OR: [{ login: nextLogin }, { subdomain: nextSubdomain }],
        },
      });

      if (existing) {
        throw new BadRequestException(
          'Company with this login or subdomain already exists',
        );
      }
    }

    if (body.login !== undefined) {
      data.login = nextLogin;
    }

    if (body.name !== undefined) {
      data.name = this.requireString(body.name, 'name');
    }

    if (body.subdomain !== undefined) {
      data.subdomain = nextSubdomain;
    }

    if (body.is_active !== undefined) {
      data.isActive = this.requireBoolean(body.is_active, 'is_active');
    }

    await this.db.company.update({
      where: { id: companyId },
      data,
    });

    return this.findCompany(companyId);
  }

  async removeCompany(companyId: string) {
    const company = await this.db.company.findUnique({
      where: { id: companyId },
      include: {
        users: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    const userIds = company.users.map((user) => user.id);

    await this.db.$transaction(async (tx: any) => {
      if (userIds.length) {
        await tx.sale.updateMany({
          where: {
            userId: {
              in: userIds,
            },
          },
          data: {
            userId: null,
          },
        });

        await tx.user.deleteMany({
          where: {
            id: {
              in: userIds,
            },
          },
        });
      }

      await tx.company.delete({
        where: { id: companyId },
      });
    });

    return {
      message: 'Company deleted',
      company_id: companyId,
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

    const shop = await this.db.shop.create({
      data: {
        companyId,
        name,
        branchCode,
      },
    });

    return this.toShopItem(shop);
  }

  async updateShop(
    companyId: string,
    shopId: string,
    body: Record<string, unknown>,
  ) {
    await this.findCompany(companyId);

    const shop = await this.findShopByIdentifier(companyId, shopId);
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      data.name = this.requireString(body.name, 'name');
    }

    let nextBranchCode: string | null = null;

    if (body.branch_code !== undefined) {
      const branchCode = this.requireIdentifier(
        body.branch_code,
        'branch_code',
      );
      const duplicate = await this.db.shop.findFirst({
        where: {
          companyId,
          branchCode,
          id: {
            not: shop.id,
          },
        },
      });

      if (duplicate) {
        throw new BadRequestException(
          'Shop with this branch_code already exists in this company',
        );
      }

      data.branchCode = branchCode;
      nextBranchCode = branchCode;
    }

    if (body.is_active !== undefined) {
      data.isActive = this.requireBoolean(body.is_active, 'is_active');
    }

    const updatedShop = await this.db.$transaction(async (tx: any) => {
      const result = await tx.shop.update({
        where: { id: shop.id },
        data,
      });

      if (nextBranchCode && nextBranchCode !== shop.branchCode) {
        await tx.user.updateMany({
          where: {
            currentShopId: shop.id,
          },
          data: {
            branchCode: nextBranchCode,
          },
        });
      }

      return result;
    });

    return this.toShopItem(updatedShop);
  }

  async removeShop(companyId: string, shopId: string) {
    await this.findCompany(companyId);

    const shop = await this.findShopByIdentifier(companyId, shopId);
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.user.updateMany({
        where: {
          companyId,
          currentShopId: shop.id,
        },
        data: {
          currentShopId: null,
          branchCode: null,
        },
      });

      await tx.shop.delete({
        where: { id: shop.id },
      });
    });

    return {
      message: 'Shop deleted',
      shop_id: shop.id,
      company_id: companyId,
    };
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

  private async findShopByIdentifier(companyId: string, identifier: string) {
    const normalizedIdentifier = this.requireString(identifier, 'shopId');

    return this.db.shop.findFirst({
      where: {
        companyId,
        OR: [
          { id: normalizedIdentifier },
          { branchCode: normalizedIdentifier },
        ],
      },
    });
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

  private requireBoolean(value: unknown, field: string) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean`);
    }

    return value;
  }

  private toCompanyItem(company: {
    id: string;
    login: string;
    name: string;
    subdomain: string;
    isActive: boolean;
    shops: Array<{
      id: string;
      companyId: string;
      name: string;
      branchCode: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;
    _count: {
      shops: number;
      users: number;
    };
    createdAt: Date;
    updatedAt: Date;
  }) {
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
