import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createDefaultCrmRolesForCompany } from '../roles/default-crm-roles';

const DEFAULT_COMPANY_ROLES = [
  { code: 'owner', name: 'Owner', isSystem: true },
  { code: 'admin', name: 'Admin', isSystem: true },
  { code: 'store_manager', name: 'Store manager', isSystem: true },
  { code: 'cashier', name: 'Cashier', isSystem: true },
  { code: 'employee', name: 'Employee', isSystem: true },
] as const;

@Injectable()
export class PlatformService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): PrismaService {
    return this.prisma;
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

    const company = await this.db.$transaction(async (tx: any) => {
      const createdCompany = await tx.company.create({
        data: {
          login,
          name,
          subdomain,
          ownerName: this.optionalString(body.owner_name ?? body.ownerName),
          ownerPhone: this.optionalString(body.owner_phone ?? body.ownerPhone),
          ownerEmail: this.optionalString(body.owner_email ?? body.ownerEmail),
          status: 'active',
          blockReason: null,
          isActive: true,
        },
      });

      await tx.companyRole.createMany({
        data: DEFAULT_COMPANY_ROLES.map((role) => ({
          companyId: createdCompany.id,
          code: role.code,
          name: role.name,
          isSystem: role.isSystem,
          isActive: true,
        })),
      });

      await createDefaultCrmRolesForCompany(tx, createdCompany.id);

      const planId = this.optionalString(body.plan_id ?? body.planId);
      if (planId) {
        const plan = await tx.plan.findUnique({
          where: { id: planId },
        });

        if (!plan || plan.status !== 'active') {
          throw new BadRequestException('Active plan not found');
        }

        const startDate =
          this.optionalDate(body.subscription_start_date) ??
          this.startOfToday();
        const endDate =
          this.optionalDate(body.subscription_end_date) ??
          this.addMonths(startDate, 1);

        await tx.subscription.create({
          data: {
            companyId: createdCompany.id,
            planId,
            status: 'active',
            startDate,
            endDate,
          },
        });
      }

      return createdCompany;
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
          orderBy: {
            name: 'asc',
          },
        },
        subscriptions: {
          include: {
            plan: true,
          },
          orderBy: {
            endDate: 'desc',
          },
          take: 1,
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

    return companies.map((company) => this.toCompanyItem(company));
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
        subscriptions: {
          include: {
            plan: true,
          },
          orderBy: {
            endDate: 'desc',
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

    if (nextLogin !== company.login || nextSubdomain !== company.subdomain) {
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
      const isActive = this.requireBoolean(body.is_active, 'is_active');
      data.isActive = isActive;
      data.status = isActive ? 'active' : 'blocked';
      data.blockReason = isActive ? null : (company.blockReason ?? 'manual');
    }

    if (body.owner_name !== undefined || body.ownerName !== undefined) {
      data.ownerName = this.optionalString(body.owner_name ?? body.ownerName);
    }

    if (body.owner_phone !== undefined || body.ownerPhone !== undefined) {
      data.ownerPhone = this.optionalString(
        body.owner_phone ?? body.ownerPhone,
      );
    }

    if (body.owner_email !== undefined || body.ownerEmail !== undefined) {
      data.ownerEmail = this.optionalString(
        body.owner_email ?? body.ownerEmail,
      );
    }

    if (body.status !== undefined) {
      const status = this.requireOneOf(body.status, 'status', [
        'active',
        'blocked',
      ]);
      data.status = status;
      data.isActive = status === 'active';
      data.blockReason =
        status === 'blocked'
          ? (this.optionalString(body.block_reason ?? body.blockReason) ??
            company.blockReason ??
            'manual')
          : null;
    }

    await this.db.company.update({
      where: { id: companyId },
      data,
    });

    return this.findCompany(companyId);
  }

  async blockCompany(
    companyId: string,
    body: Record<string, unknown> = {},
    adminId?: number,
  ) {
    const reason =
      this.optionalString(body.block_reason ?? body.blockReason) ?? 'manual';

    await this.db.$transaction(async (tx: any) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: 'blocked',
          isActive: false,
          blockReason: reason,
        },
      });

      await tx.user.updateMany({
        where: {
          companyId,
          userType: 'company',
        },
        data: {
          status: 'blocked',
          isActive: false,
        },
      });

      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId,
          action: 'company_blocked',
          description: reason,
        },
      });
    });

    return this.findCompany(companyId);
  }

  async unblockCompany(companyId: string, adminId?: number) {
    await this.db.$transaction(async (tx: any) => {
      await tx.company.update({
        where: { id: companyId },
        data: {
          status: 'active',
          isActive: true,
          blockReason: null,
        },
      });

      await tx.user.updateMany({
        where: {
          companyId,
          userType: 'company',
          deletedAt: 0,
        },
        data: {
          status: 'active',
          isActive: true,
        },
      });

      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId,
          action: 'company_unblocked',
          description: 'Company unblocked',
        },
      });
    });

    return this.findCompany(companyId);
  }

  async updateCompanyStatus(companyId: string, body: Record<string, unknown>) {
    const isActive = this.requireBoolean(body.is_active, 'is_active');

    await this.updateCompany(companyId, {
      is_active: isActive,
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

  async updateShopStatus(
    companyId: string,
    shopId: string,
    body: Record<string, unknown>,
  ) {
    const isActive = this.requireBoolean(body.is_active, 'is_active');

    return this.updateShop(companyId, shopId, {
      is_active: isActive,
    });
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

  async getDashboardStats() {
    const now = new Date();
    const expiringSoonEnd = new Date(now);
    expiringSoonEnd.setDate(expiringSoonEnd.getDate() + 7);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const [
      totalCompanies,
      activeCompanies,
      blockedCompanies,
      activeSubscriptions,
      expiredSubscriptions,
      expiringSoonSubscriptions,
      monthlyPayments,
    ] = await this.db.$transaction([
      this.db.company.count(),
      this.db.company.count({
        where: {
          status: 'active',
          isActive: true,
        },
      }),
      this.db.company.count({
        where: {
          OR: [{ status: 'blocked' }, { isActive: false }],
        },
      }),
      this.db.subscription.count({ where: { status: 'active' } }),
      this.db.subscription.count({ where: { status: 'expired' } }),
      this.db.subscription.count({
        where: {
          status: 'active',
          endDate: {
            gte: now,
            lte: expiringSoonEnd,
          },
        },
      }),
      this.db.payment.findMany({
        where: {
          paidAt: {
            gte: monthStart,
            lt: nextMonthStart,
          },
        },
        select: {
          amount: true,
        },
      }),
    ]);

    return {
      totalCompanies,
      activeCompanies,
      blockedCompanies,
      activeSubscriptions,
      expiredSubscriptions,
      expiringSoonSubscriptions,
      monthlyRevenue: monthlyPayments.reduce(
        (sum, payment) => sum + Number(payment.amount),
        0,
      ),
    };
  }

  async findPlans() {
    const plans = await this.db.plan.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return plans.map((plan) => this.toPlanItem(plan));
  }

  async createPlan(body: Record<string, unknown>) {
    const plan = await this.db.plan.create({
      data: {
        name: this.requireString(body.name, 'name'),
        priceMonthly: this.requireNumber(
          body.price_monthly ?? body.priceMonthly,
          'price_monthly',
        ),
        maxShops: this.requireInteger(
          body.max_shops ?? body.maxShops,
          'max_shops',
        ),
        maxUsers: this.requireInteger(
          body.max_users ?? body.maxUsers,
          'max_users',
        ),
        maxProducts: this.requireInteger(
          body.max_products ?? body.maxProducts,
          'max_products',
        ),
        status:
          this.optionalOneOf(body.status, ['active', 'inactive']) ?? 'active',
      },
    });

    return this.toPlanItem(plan);
  }

  async updatePlan(planId: string, body: Record<string, unknown>) {
    await this.findPlanOrThrow(planId);
    const data: Record<string, unknown> = {};

    if (body.name !== undefined)
      data.name = this.requireString(body.name, 'name');
    if (body.price_monthly !== undefined || body.priceMonthly !== undefined) {
      data.priceMonthly = this.requireNumber(
        body.price_monthly ?? body.priceMonthly,
        'price_monthly',
      );
    }
    if (body.max_shops !== undefined || body.maxShops !== undefined) {
      data.maxShops = this.requireInteger(
        body.max_shops ?? body.maxShops,
        'max_shops',
      );
    }
    if (body.max_users !== undefined || body.maxUsers !== undefined) {
      data.maxUsers = this.requireInteger(
        body.max_users ?? body.maxUsers,
        'max_users',
      );
    }
    if (body.max_products !== undefined || body.maxProducts !== undefined) {
      data.maxProducts = this.requireInteger(
        body.max_products ?? body.maxProducts,
        'max_products',
      );
    }
    if (body.status !== undefined) {
      data.status = this.requireOneOf(body.status, 'status', [
        'active',
        'inactive',
      ]);
    }

    const plan = await this.db.plan.update({
      where: { id: planId },
      data,
    });

    return this.toPlanItem(plan);
  }

  async removePlan(planId: string) {
    await this.findPlanOrThrow(planId);
    const subscriptionsCount = await this.db.subscription.count({
      where: { planId },
    });

    if (subscriptionsCount) {
      await this.db.plan.update({
        where: { id: planId },
        data: { status: 'inactive' },
      });

      return { message: 'Plan deactivated', plan_id: planId };
    }

    await this.db.plan.delete({ where: { id: planId } });
    return { message: 'Plan deleted', plan_id: planId };
  }

  async findSubscriptions() {
    const subscriptions = await this.db.subscription.findMany({
      include: {
        company: true,
        plan: true,
      },
      orderBy: { endDate: 'asc' },
    });

    return subscriptions.map((subscription) =>
      this.toSubscriptionItem(subscription),
    );
  }

  async changePlan(
    subscriptionId: string,
    planId: string,
    adminId: number,
  ) {
    const subscription = await this.findSubscriptionOrThrow(subscriptionId);

    const plan = await this.db.plan.findUnique({ where: { id: planId } });
    if (!plan || plan.status !== 'active') {
      throw new BadRequestException('Active plan not found');
    }

    if (subscription.planId === planId) {
      throw new BadRequestException('Company already uses this plan');
    }

    const oldPlanName = subscription.plan?.name ?? subscription.planId;

    const updated = await this.db.$transaction(async (tx: any) => {
      const result = await tx.subscription.update({
        where: { id: subscriptionId },
        data: { planId },
        include: { company: true, plan: true },
      });

      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId: subscription.companyId,
          action: 'plan_changed',
          description: `Plan changed from "${oldPlanName}" to "${plan.name}"`,
        },
      });

      return result;
    });

    return this.toSubscriptionItem(updated);
  }

  async renewSubscription(
    subscriptionId: string,
    adminId?: number,
    months = 1,
  ) {
    const subscription = await this.findSubscriptionOrThrow(subscriptionId);
    const today = this.startOfToday();
    const isActive =
      subscription.status === 'active' && subscription.endDate >= today;
    const startDate = isActive ? subscription.startDate : today;
    const endDateBase = isActive ? subscription.endDate : today;
    const endDate = this.addMonths(endDateBase, months);

    const updated = await this.db.$transaction(async (tx: any) => {
      const result = await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          startDate,
          endDate,
        },
        include: {
          company: true,
          plan: true,
        },
      });

      await tx.company.update({
        where: { id: subscription.companyId },
        data: {
          status: 'active',
          isActive: true,
          blockReason: null,
        },
      });

      await tx.user.updateMany({
        where: {
          companyId: subscription.companyId,
          userType: 'company',
          deletedAt: 0,
        },
        data: {
          status: 'active',
          isActive: true,
        },
      });

      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId: subscription.companyId,
          action: 'subscription_renewed',
          description: `Subscription renewed until ${endDate.toISOString()}`,
        },
      });

      return result;
    });

    return this.toSubscriptionItem(updated);
  }

  async checkExpiredSubscriptions(adminId?: number) {
    const today = this.startOfToday();
    const subscriptions = await this.db.subscription.findMany({
      where: {
        status: 'active',
        endDate: {
          lt: today,
        },
      },
      select: {
        id: true,
        companyId: true,
      },
    });

    if (!subscriptions.length) {
      return { expired_count: 0 };
    }

    await this.db.$transaction(async (tx: any) => {
      for (const subscription of subscriptions) {
        await tx.subscription.update({
          where: { id: subscription.id },
          data: { status: 'expired' },
        });

        await tx.company.update({
          where: { id: subscription.companyId },
          data: {
            status: 'blocked',
            isActive: false,
            blockReason: 'subscription_expired',
          },
        });

        await tx.user.updateMany({
          where: {
            companyId: subscription.companyId,
            userType: 'company',
          },
          data: {
            status: 'blocked',
            isActive: false,
          },
        });

        await tx.platformActionLog.create({
          data: {
            adminId,
            companyId: subscription.companyId,
            action: 'subscription_expired',
            description: 'Subscription expired and company was blocked',
          },
        });
      }
    });

    return { expired_count: subscriptions.length };
  }

  async findPayments() {
    const payments = await this.db.payment.findMany({
      include: {
        company: true,
        subscription: {
          include: {
            plan: true,
          },
        },
        createdBy: true,
      },
      orderBy: { paidAt: 'desc' },
    });

    return payments.map((payment) => this.toPaymentItem(payment));
  }

  async createPayment(body: Record<string, unknown>, adminId: number) {
    const subscription = await this.findSubscriptionOrThrow(
      this.requireString(
        body.subscription_id ?? body.subscriptionId,
        'subscription_id',
      ),
    );
    const amount = this.requireNumber(body.amount, 'amount');
    const method = this.requireOneOf(body.method, 'method', [
      'cash',
      'card',
      'click',
      'payme',
      'bank',
      'other',
    ]);
    const paidAt = this.optionalDate(body.paid_at ?? body.paidAt) ?? new Date();
    const today = this.startOfToday();
    const periodStart =
      subscription.status === 'active' && subscription.endDate >= today
        ? subscription.endDate
        : today;
    const periodEnd = this.addMonths(periodStart, 1);

    const payment = await this.db.$transaction(async (tx: any) => {
      const created = await tx.payment.create({
        data: {
          companyId: subscription.companyId,
          subscriptionId: subscription.id,
          amount,
          method,
          paidAt,
          periodStart,
          periodEnd,
          comment: this.optionalString(body.comment),
          createdById: adminId,
        },
        include: {
          company: true,
          subscription: {
            include: {
              plan: true,
            },
          },
          createdBy: true,
        },
      });

      await tx.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'active',
          startDate:
            subscription.status === 'active' && subscription.endDate >= today
              ? subscription.startDate
              : today,
          endDate: periodEnd,
        },
      });

      await tx.company.update({
        where: { id: subscription.companyId },
        data: {
          status: 'active',
          isActive: true,
          blockReason: null,
        },
      });

      await tx.user.updateMany({
        where: {
          companyId: subscription.companyId,
          userType: 'company',
          deletedAt: 0,
        },
        data: {
          status: 'active',
          isActive: true,
        },
      });

      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId: subscription.companyId,
          action: 'payment_created',
          description: `Payment ${amount} created`,
        },
      });

      return created;
    });

    return this.toPaymentItem(payment);
  }

  async getSettings() {
    const settings = await this.db.platformSetting.findUnique({
      where: { id: 'default' },
    });

    return settings?.data ?? {};
  }

  async updateSettings(body: Record<string, unknown>) {
    const settings = await this.db.platformSetting.upsert({
      where: { id: 'default' },
      update: { data: body as any },
      create: { id: 'default', data: body as any },
    });

    return settings.data;
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

  private optionalString(value: unknown) {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== 'string') {
      throw new BadRequestException('value must be a string');
    }

    const normalized = value.trim();
    return normalized.length ? normalized : null;
  }

  private requireNumber(value: unknown, field: string) {
    const numberValue =
      typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

    if (!Number.isFinite(numberValue) || numberValue < 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }

    return numberValue;
  }

  private requireInteger(value: unknown, field: string) {
    const numberValue = this.requireNumber(value, field);

    if (!Number.isInteger(numberValue)) {
      throw new BadRequestException(`${field} must be an integer`);
    }

    return numberValue;
  }

  private requireOneOf<T extends string>(
    value: unknown,
    field: string,
    allowedValues: readonly T[],
  ) {
    const normalized = this.requireString(value, field).toLowerCase() as T;

    if (!allowedValues.includes(normalized)) {
      throw new BadRequestException(
        `${field} must be one of: ${allowedValues.join(', ')}`,
      );
    }

    return normalized;
  }

  private optionalOneOf<T extends string>(
    value: unknown,
    allowedValues: readonly T[],
  ) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return this.requireOneOf(value, 'status', allowedValues);
  }

  private optionalDate(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    const date = new Date(String(value));
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('date must be a valid date');
    }

    return date;
  }

  private startOfToday() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  private addMonths(value: Date, months: number) {
    const nextDate = new Date(value);
    nextDate.setMonth(nextDate.getMonth() + months);
    return nextDate;
  }

  private async findPlanOrThrow(planId: string) {
    const plan = await this.db.plan.findUnique({
      where: { id: planId },
    });

    if (!plan) {
      throw new NotFoundException('Plan not found');
    }

    return plan;
  }

  private async findSubscriptionOrThrow(subscriptionId: string) {
    const subscription = await this.db.subscription.findUnique({
      where: { id: subscriptionId },
      include: {
        company: true,
        plan: true,
      },
    });

    if (!subscription) {
      throw new NotFoundException('Subscription not found');
    }

    return subscription;
  }

  private toPlanItem(plan: any) {
    return {
      id: plan.id,
      name: plan.name,
      priceMonthly: Number(plan.priceMonthly),
      price_monthly: Number(plan.priceMonthly),
      maxShops: plan.maxShops,
      max_shops: plan.maxShops,
      maxUsers: plan.maxUsers,
      max_users: plan.maxUsers,
      maxProducts: plan.maxProducts,
      max_products: plan.maxProducts,
      status: plan.status,
      createdAt: plan.createdAt,
      created_at: plan.createdAt,
      updatedAt: plan.updatedAt,
      updated_at: plan.updatedAt,
    };
  }

  private toSubscriptionItem(subscription: any) {
    return {
      id: subscription.id,
      companyId: subscription.companyId,
      company_id: subscription.companyId,
      planId: subscription.planId,
      plan_id: subscription.planId,
      status: subscription.status,
      startDate: subscription.startDate,
      start_date: subscription.startDate,
      endDate: subscription.endDate,
      end_date: subscription.endDate,
      company: subscription.company
        ? {
            id: subscription.company.id,
            name: subscription.company.name,
            status: subscription.company.status,
            is_active: subscription.company.isActive,
          }
        : null,
      plan: subscription.plan ? this.toPlanItem(subscription.plan) : null,
      createdAt: subscription.createdAt,
      created_at: subscription.createdAt,
      updatedAt: subscription.updatedAt,
      updated_at: subscription.updatedAt,
    };
  }

  private toPaymentItem(payment: any) {
    return {
      id: payment.id,
      companyId: payment.companyId,
      company_id: payment.companyId,
      subscriptionId: payment.subscriptionId,
      subscription_id: payment.subscriptionId,
      amount: Number(payment.amount),
      method: payment.method,
      paidAt: payment.paidAt,
      paid_at: payment.paidAt,
      periodStart: payment.periodStart,
      period_start: payment.periodStart,
      periodEnd: payment.periodEnd,
      period_end: payment.periodEnd,
      comment: payment.comment,
      createdById: payment.createdById,
      created_by_id: payment.createdById,
      company: payment.company
        ? {
            id: payment.company.id,
            name: payment.company.name,
          }
        : null,
      subscription: payment.subscription
        ? this.toSubscriptionItem(payment.subscription)
        : null,
      created_by: payment.createdBy
        ? {
            id: payment.createdBy.id,
            name: `${payment.createdBy.firstName} ${payment.createdBy.lastName}`.trim(),
          }
        : null,
      createdAt: payment.createdAt,
      created_at: payment.createdAt,
    };
  }

  private toCompanyItem(company: {
    id: string;
    login: string;
    name: string;
    subdomain: string;
    ownerName?: string | null;
    ownerPhone?: string | null;
    ownerEmail?: string | null;
    status?: string;
    blockReason?: string | null;
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
    subscriptions?: any[];
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
      ownerName: company.ownerName ?? null,
      owner_name: company.ownerName ?? null,
      ownerPhone: company.ownerPhone ?? null,
      owner_phone: company.ownerPhone ?? null,
      ownerEmail: company.ownerEmail ?? null,
      owner_email: company.ownerEmail ?? null,
      status: company.status ?? (company.isActive ? 'active' : 'blocked'),
      blockReason: company.blockReason ?? null,
      block_reason: company.blockReason ?? null,
      is_active: company.isActive,
      subscription: company.subscriptions?.[0]
        ? this.toSubscriptionItem(company.subscriptions[0])
        : null,
      subscriptions: company.subscriptions?.map((subscription) =>
        this.toSubscriptionItem(subscription),
      ),
      shops_count: company._count.shops,
      users_count: company._count.users,
      shops: company.shops.map((shop) => this.toShopItem(shop)),
      created_at: company.createdAt,
      updated_at: company.updatedAt,
    };
  }

  async deleteCompanyProduct(companyId: string, productId: string, adminId: number) {
    await this.findCompany(companyId);

    const product = await this.db.product.findFirst({
      where: { publicId: productId, companyId },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.product.delete({ where: { id: product.id } });
      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId,
          action: 'product_deleted',
          description: `Product "${product.name}" (${productId}) deleted`,
        },
      });
    });

    return {
      message: 'Product deleted',
      product_id: productId,
      company_id: companyId,
    };
  }

  async findCompanyProducts(
    companyId: string,
    query: { page?: number; limit?: number; search?: string } = {},
  ) {
    await this.findCompany(companyId);

    const safePage = Math.max(1, query.page ?? 1);
    const safeLimit = Math.min(Math.max(1, query.limit ?? 20), 100);
    const search = query.search?.trim();

    const where: Record<string, unknown> = { companyId };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { barcode: { contains: search } },
      ];
    }

    const [total, products] = await this.db.$transaction([
      this.db.product.count({ where }),
      this.db.product.findMany({
        where,
        select: {
          id: true,
          publicId: true,
          name: true,
          sku: true,
          barcode: true,
          salePrice: true,
          purchasePrice: true,
          archivedAt: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
    ]);

    return {
      total,
      page: safePage,
      limit: safeLimit,
      company_id: companyId,
      products: products.map((p) => ({
        id: p.publicId ?? String(p.id),
        name: p.name,
        sku: p.sku ?? '',
        barcode: p.barcode ?? '',
        sale_price: p.salePrice ?? 0,
        purchase_price: p.purchasePrice ?? 0,
        is_archived: Boolean(p.archivedAt),
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      })),
    };
  }

  async deleteAllCompanyProducts(companyId: string, adminId: number) {
    await this.findCompany(companyId);

    const { count } = await this.db.$transaction(async (tx: any) => {
      const result = await tx.product.deleteMany({ where: { companyId } });
      await tx.platformActionLog.create({
        data: {
          adminId,
          companyId,
          action: 'all_products_deleted',
          description: `All ${result.count} products deleted for company`,
        },
      });
      return result;
    });

    return {
      message: 'All products deleted',
      deleted_count: count,
      company_id: companyId,
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
