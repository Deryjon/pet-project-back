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
}
