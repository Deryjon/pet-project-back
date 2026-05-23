import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ClientCardType,
  ClientDebtStatus,
  ClientGender,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

type ClientContext = Awaited<ReturnType<UsersService['getRequestContext']>>;
type ClientListRecord = Prisma.ClientGetPayload<{
  include: {
    registrationShop: true;
    groups: { include: { group: true } };
    tags: { include: { tag: true } };
  };
}>;

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async findAll(
    query: Record<string, string | string[] | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const page = this.parsePositiveInt(query.page, 1);
    const limit = Math.min(this.parsePositiveInt(query.limit, 10), 100);
    const clients = await this.prisma.client.findMany({
      where: this.buildClientWhere(query, context.companyId),
      include: this.clientListInclude(),
      orderBy: [{ createdAt: 'desc' }],
    });
    const metrics = await this.loadClientMetrics(
      clients.map((client) => client.id),
      context,
    );
    const filtered = clients
      .map((client) => this.toClientListItem(client, metrics.get(client.id)))
      .filter((item) => this.matchesMetricFilters(item, query));

    return {
      items: filtered.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: filtered.length,
      stats: await this.getListStats(context),
    };
  }

  async findOne(id: string, authorization?: string) {
    const context = await this.getContext(authorization);
    const client = await this.findClientOrThrow(id, context.companyId);

    return {
      client: {
        id: client.id,
        code: client.code,
        first_name: client.firstName,
        last_name: client.lastName,
        middle_name: client.middleName,
        full_name: this.buildFullName(client),
        phone: client.phone,
        gender: client.gender,
        birth_date: this.toDateOnly(client.birthDate),
        marital_status: client.maritalStatus,
        address: client.address,
        social_links: this.toStringArray(client.socialLinks),
        relatives: this.toStringArray(client.relatives),
        registration_shop: client.registrationShop
          ? { id: client.registrationShop.id, name: client.registrationShop.name }
          : null,
        registered_at: client.registeredAt.toISOString(),
        sms_notifications: client.smsNotifications,
        phone_notifications: client.phoneNotifications,
        social_notifications: client.socialNotifications,
        email_notifications: client.emailNotifications,
      },
      dashboard: await this.buildClientDashboard(id, context),
    };
  }

  async getNotes(id: string, authorization?: string) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const notes = await this.prisma.clientNote.findMany({
      where: { companyId: context.companyId, clientId: id },
      include: { createdBy: true },
      orderBy: { createdAt: 'desc' },
    });

    return notes.map((note) => this.toNoteResponse(note));
  }

  async createNote(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const note = await this.prisma.clientNote.create({
      data: {
        companyId: context.companyId,
        clientId: id,
        createdById: context.userId,
        text: this.requireString(body.text, 'text'),
      },
      include: { createdBy: true },
    });

    return this.toNoteResponse(note);
  }

  async getHistory(
    id: string,
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const client = await this.findClientOrThrow(id, context.companyId);
    const page = this.parsePositiveInt(query.page, 1);
    const limit = Math.min(this.parsePositiveInt(query.limit, 20), 100);
    const type = query.type ?? 'all';
    const from = this.parseDateTime(query.from);
    const to = this.parseDateTime(query.to);
    const purchaseWhere = this.completedOrderWhere(id, context);
    const [orders, notes, debts, repayments] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where: purchaseWhere,
        select: {
          id: true,
          orderNumber: true,
          totalPrice: true,
          completedAt: true,
          createdAt: true,
        },
      }),
      this.prisma.clientNote.findMany({
        where: { companyId: context.companyId, clientId: id },
        select: { id: true, text: true, createdAt: true },
      }),
      this.prisma.clientDebt.findMany({
        where: { companyId: context.companyId, clientId: id },
        select: { id: true, amountUzs: true, createdAt: true },
      }),
      this.prisma.clientDebtRepayment.findMany({
        where: { companyId: context.companyId, clientId: id },
        select: { id: true, debtId: true, amountUzs: true, createdAt: true },
      }),
    ]);

    const items = [
      {
        id: `client-created:${client.id}`,
        client_id: client.id,
        type: 'log',
        title: 'Добавление клиента в систему',
        description: null,
        happened_at: client.createdAt.toISOString(),
        amount_uzs: null,
        order_id: null,
      },
      ...orders.map((order) => ({
        id: `purchase:${order.id}`,
        client_id: id,
        type: 'purchase',
        title: `Покупка №${order.orderNumber}`,
        description: null,
        happened_at: (order.completedAt ?? order.createdAt).toISOString(),
        amount_uzs: this.decimalToNumber(order.totalPrice),
        order_id: order.id,
      })),
      ...notes.map((note) => ({
        id: `note:${note.id}`,
        client_id: id,
        type: 'log',
        title: 'Добавлена заметка',
        description: note.text,
        happened_at: note.createdAt.toISOString(),
        amount_uzs: null,
        order_id: null,
      })),
      ...debts.map((debt) => ({
        id: `debt:${debt.id}`,
        client_id: id,
        type: 'log',
        title: 'Создан долг',
        description: null,
        happened_at: debt.createdAt.toISOString(),
        amount_uzs: this.decimalToNumber(debt.amountUzs),
        order_id: null,
      })),
      ...repayments.map((repayment) => ({
        id: `repayment:${repayment.id}`,
        client_id: id,
        type: 'log',
        title: 'Погашение долга',
        description: `Долг ${repayment.debtId}`,
        happened_at: repayment.createdAt.toISOString(),
        amount_uzs: this.decimalToNumber(repayment.amountUzs),
        order_id: null,
      })),
    ]
      .filter((item) => type === 'all' || item.type === type)
      .filter((item) => this.matchesDateRange(item.happened_at, from, to))
      .sort(
        (a, b) =>
          new Date(b.happened_at).getTime() - new Date(a.happened_at).getTime(),
      );

    return {
      items: items.slice((page - 1) * limit, page * limit),
      page,
      limit,
      total: items.length,
    };
  }

  async getPreferences(id: string, authorization?: string) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const items = await this.prisma.orderItem.findMany({
      where: {
        order: this.completedOrderWhere(id, context),
      },
      include: {
        product: true,
        order: { select: { completedAt: true, createdAt: true } },
      },
    });
    const grouped = new Map<string, any>();

    for (const item of items) {
      if (!item.productId || !item.product) {
        continue;
      }

      const key = String(item.productId);
      const existing = grouped.get(key) ?? {
        product_id: key,
        product_name: item.product.name,
        barcode: item.product.barcode,
        image_url: item.product.photo,
        purchase_count: 0,
        last_purchased_at: null,
      };
      existing.purchase_count += 1;
      const happenedAt = (
        item.order.completedAt ?? item.order.createdAt
      ).toISOString();
      if (
        !existing.last_purchased_at ||
        new Date(existing.last_purchased_at) < new Date(happenedAt)
      ) {
        existing.last_purchased_at = happenedAt;
      }
      grouped.set(key, existing);
    }

    return [...grouped.values()].sort(
      (a, b) => b.purchase_count - a.purchase_count,
    );
  }

  async getDebts(id: string, authorization?: string) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const debts = await this.prisma.clientDebt.findMany({
      where: { companyId: context.companyId, clientId: id },
      include: { shop: true },
      orderBy: { createdAt: 'desc' },
    });
    const items = debts.map((debt) => ({
      id: debt.id,
      client_id: debt.clientId,
      amount_uzs: this.decimalToNumber(debt.amountUzs),
      remaining_amount_uzs: this.decimalToNumber(debt.remainingAmountUzs),
      repaid_amount_uzs: this.decimalToNumber(debt.repaidAmountUzs),
      due_date: this.toDateOnly(debt.dueDate),
      status: debt.status,
      shop: debt.shop ? { id: debt.shop.id, name: debt.shop.name } : null,
      created_at: debt.createdAt.toISOString(),
      receipt_url: debt.receiptUrl,
    }));

    return {
      items,
      summary: {
        active_debt_uzs: items
          .filter((item) => item.status !== ClientDebtStatus.paid)
          .reduce((sum, item) => sum + item.remaining_amount_uzs, 0),
        total_repaid_uzs: items.reduce(
          (sum, item) => sum + item.repaid_amount_uzs,
          0,
        ),
        total_debt_uzs: items.reduce((sum, item) => sum + item.amount_uzs, 0),
      },
    };
  }

  async repayDebt(
    clientId: string,
    debtId: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(clientId, context.companyId);
    const amount = new Prisma.Decimal(
      this.requirePositiveNumber(body.amount_uzs ?? body.amount, 'amount_uzs'),
    );
    const debt = await this.prisma.$transaction(async (tx) => {
      const currentDebt = await tx.clientDebt.findFirst({
        where: { id: debtId, companyId: context.companyId, clientId },
      });
      if (!currentDebt) {
        throw new NotFoundException('Debt not found');
      }
      if (currentDebt.remainingAmountUzs.lte(0)) {
        throw new BadRequestException('Debt is already repaid');
      }
      if (amount.gt(currentDebt.remainingAmountUzs)) {
        throw new BadRequestException(
          'Repayment amount exceeds remaining debt amount',
        );
      }

      const remaining = currentDebt.remainingAmountUzs.minus(amount);
      const repaid = currentDebt.repaidAmountUzs.plus(amount);
      await tx.clientDebtRepayment.create({
        data: {
          companyId: context.companyId,
          clientId,
          debtId,
          createdById: context.userId,
          amountUzs: amount,
        },
      });
      const updatedDebt = await tx.clientDebt.update({
        where: { id: currentDebt.id },
        data: {
          remainingAmountUzs: remaining,
          repaidAmountUzs: repaid,
          status: remaining.lte(0)
            ? ClientDebtStatus.paid
            : ClientDebtStatus.partial,
        },
      });
      const aggregate = await tx.clientDebt.aggregate({
        where: { companyId: context.companyId, clientId },
        _sum: { remainingAmountUzs: true },
      });
      await tx.client.update({
        where: { id: clientId },
        data: {
          debtUzs: aggregate._sum.remainingAmountUzs ?? new Prisma.Decimal(0),
        },
      });
      return updatedDebt;
    });

    return {
      id: debt.id,
      client_id: debt.clientId,
      amount_uzs: this.decimalToNumber(debt.amountUzs),
      remaining_amount_uzs: this.decimalToNumber(debt.remainingAmountUzs),
      repaid_amount_uzs: this.decimalToNumber(debt.repaidAmountUzs),
      due_date: this.toDateOnly(debt.dueDate),
      status: debt.status,
      created_at: debt.createdAt.toISOString(),
      receipt_url: debt.receiptUrl,
    };
  }

  async getCards(id: string, authorization?: string) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const cards = await this.prisma.clientCard.findMany({
      where: { companyId: context.companyId, clientId: id },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });

    return cards.map((card) => ({
      id: card.id,
      client_id: card.clientId,
      type: card.type,
      number: card.number,
      is_active: card.isActive,
      issued_at: card.issuedAt?.toISOString() ?? null,
      expires_at: card.expiresAt?.toISOString() ?? null,
    }));
  }

  async createCard(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const card = await this.prisma.clientCard.create({
      data: {
        companyId: context.companyId,
        clientId: id,
        type: this.parseClientCardType(body.type),
        number: this.requireString(body.number, 'number'),
        isActive: this.parseBoolean(body.is_active, true),
        issuedAt: this.parseNullableDateTime(body.issued_at),
        expiresAt: this.parseNullableDateTime(body.expires_at),
      },
    });

    return {
      id: card.id,
      client_id: card.clientId,
      type: card.type,
      number: card.number,
      is_active: card.isActive,
      issued_at: card.issuedAt?.toISOString() ?? null,
      expires_at: card.expiresAt?.toISOString() ?? null,
    };
  }

  async getGroups(authorization?: string) {
    const context = await this.getContext(authorization);
    const groups = await this.prisma.clientGroup.findMany({
      where: { companyId: context.companyId },
      orderBy: { name: 'asc' },
    });

    return groups.map((group) => ({ id: group.id, name: group.name }));
  }

  async getTags(authorization?: string) {
    const context = await this.getContext(authorization);
    const tags = await this.prisma.clientTag.findMany({
      where: { companyId: context.companyId },
      orderBy: { name: 'asc' },
    });

    return tags.map((tag) => ({ id: tag.id, name: tag.name }));
  }

  async getFilters(authorization?: string) {
    const context = await this.getContext(authorization);
    const [groups, tags, shops] = await this.prisma.$transaction([
      this.prisma.clientGroup.findMany({
        where: { companyId: context.companyId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.clientTag.findMany({
        where: { companyId: context.companyId },
        orderBy: { name: 'asc' },
      }),
      this.prisma.shop.findMany({
        where: {
          companyId: context.companyId,
          ...(context.allowedShopIds.length
            ? { id: { in: context.allowedShopIds } }
            : {}),
        },
        orderBy: { name: 'asc' },
      }),
    ]);

    return {
      groups: groups.map((group) => ({ id: group.id, name: group.name })),
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name })),
      shops: shops.map((shop) => ({ id: shop.id, name: shop.name })),
      genders: Object.values(ClientGender),
    };
  }

  private async getContext(authorization?: string) {
    return this.usersService.getRequestContext(authorization);
  }

  private async findClientOrThrow(id: string, companyId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, companyId },
      include: { registrationShop: true },
    });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    return client;
  }

  private clientListInclude() {
    return {
      registrationShop: true,
      groups: { include: { group: true } },
      tags: { include: { tag: true } },
    } satisfies Prisma.ClientInclude;
  }

  private buildClientWhere(
    query: Record<string, string | string[] | undefined>,
    companyId: string,
  ): Prisma.ClientWhereInput {
    const where: Prisma.ClientWhereInput = { companyId };
    const search = this.optionalString(query.search);
    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { middleName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const groupIds = this.parseStringArray(query.group_ids);
    if (groupIds.length) {
      where.groups = { some: { groupId: { in: groupIds } } };
    }

    const tagIds = this.parseStringArray(query.tag_ids);
    if (tagIds.length) {
      where.tags = { some: { tagId: { in: tagIds } } };
    }

    const shopIds = this.parseStringArray(query.registration_shop_ids);
    if (shopIds.length) {
      where.registrationShopId = { in: shopIds };
    }

    const birthDateFrom = this.parseDateOnly(query.birth_date_from);
    const birthDateTo = this.parseDateOnly(query.birth_date_to);
    if (birthDateFrom || birthDateTo) {
      where.birthDate = {};
      if (birthDateFrom) where.birthDate.gte = birthDateFrom;
      if (birthDateTo) where.birthDate.lte = birthDateTo;
    }

    const registeredFrom = this.parseDateTime(query.registered_from);
    const registeredTo = this.parseDateTime(query.registered_to);
    if (registeredFrom || registeredTo) {
      where.registeredAt = {};
      if (registeredFrom) where.registeredAt.gte = registeredFrom;
      if (registeredTo) where.registeredAt.lte = registeredTo;
    }

    const gender = this.parseNullableGender(query.gender);
    if (gender) {
      where.gender = gender;
    }

    return where;
  }

  private completedOrderWhere(id: string, context: ClientContext): Prisma.OrderWhereInput {
    return {
      companyId: context.companyId,
      customerId: id,
      status: OrderStatus.COMPLETED,
      ...(context.allowedShopIds.length
        ? { shopId: { in: context.allowedShopIds } }
        : {}),
    };
  }

  private async loadClientMetrics(clientIds: string[], context: ClientContext) {
    const metrics = new Map<
      string,
      { totalPurchases: number; visitsCount: number; lastPurchaseAt: string | null }
    >();
    if (!clientIds.length) {
      return metrics;
    }

    const groups = await this.prisma.order.groupBy({
      by: ['customerId'],
      where: {
        companyId: context.companyId,
        customerId: { in: clientIds },
        status: OrderStatus.COMPLETED,
        ...(context.allowedShopIds.length
          ? { shopId: { in: context.allowedShopIds } }
          : {}),
      },
      _sum: { totalPrice: true },
      _count: { _all: true },
      _max: { completedAt: true },
    });

    for (const item of groups) {
      if (!item.customerId) {
        continue;
      }
      metrics.set(item.customerId, {
        totalPurchases: this.decimalToNumber(item._sum.totalPrice),
        visitsCount: item._count._all,
        lastPurchaseAt: item._max.completedAt?.toISOString() ?? null,
      });
    }

    return metrics;
  }

  private toClientListItem(client: ClientListRecord, metric?: { totalPurchases: number; visitsCount: number; lastPurchaseAt: string | null }) {
    return {
      id: client.id,
      code: client.code,
      full_name: this.buildFullName(client),
      phone: client.phone,
      groups: client.groups.map((item) => ({
        id: item.group.id,
        name: item.group.name,
      })),
      tags: client.tags.map((item) => ({
        id: item.tag.id,
        name: item.tag.name,
      })),
      gender: client.gender,
      total_purchases_uzs:
        metric?.totalPurchases ?? this.decimalToNumber(client.totalPurchasesUzs),
      last_purchase_at:
        metric?.lastPurchaseAt ?? client.lastPurchaseAt?.toISOString() ?? null,
      birth_date: this.toDateOnly(client.birthDate),
      registered_at: client.registeredAt.toISOString(),
      registration_shop: client.registrationShop
        ? { id: client.registrationShop.id, name: client.registrationShop.name }
        : null,
      balance_uzs: this.decimalToNumber(client.balanceUzs),
      debt_uzs: this.decimalToNumber(client.debtUzs),
      visits_count: metric?.visitsCount ?? client.visitsCount,
    };
  }

  private matchesMetricFilters(
    item: { total_purchases_uzs: number; last_purchase_at: string | null },
    query: Record<string, string | string[] | undefined>,
  ) {
    const purchasesFrom = this.parseOptionalNumber(query.total_purchases_from);
    const purchasesTo = this.parseOptionalNumber(query.total_purchases_to);
    const lastPurchaseFrom = this.parseDateTime(query.last_purchase_from);
    const lastPurchaseTo = this.parseDateTime(query.last_purchase_to);
    const noPurchaseMonths = this.parseOptionalNumber(query.no_purchase_months);

    if (purchasesFrom !== null && item.total_purchases_uzs < purchasesFrom) {
      return false;
    }
    if (purchasesTo !== null && item.total_purchases_uzs > purchasesTo) {
      return false;
    }
    if ((lastPurchaseFrom || lastPurchaseTo) && !item.last_purchase_at) {
      return false;
    }
    if (
      lastPurchaseFrom &&
      item.last_purchase_at &&
      new Date(item.last_purchase_at) < lastPurchaseFrom
    ) {
      return false;
    }
    if (
      lastPurchaseTo &&
      item.last_purchase_at &&
      new Date(item.last_purchase_at) > lastPurchaseTo
    ) {
      return false;
    }
    if (noPurchaseMonths !== null) {
      if (!item.last_purchase_at) {
        return true;
      }
      const threshold = new Date();
      threshold.setMonth(threshold.getMonth() - noPurchaseMonths);
      if (new Date(item.last_purchase_at) > threshold) {
        return false;
      }
    }

    return true;
  }

  private async getListStats(context: ClientContext) {
    const clients = await this.prisma.client.findMany({
      where: { companyId: context.companyId },
      select: { id: true, birthDate: true, registeredAt: true },
    });
    const metrics = await this.loadClientMetrics(
      clients.map((client) => client.id),
      context,
    );
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const today = new Date();

    return {
      total_clients: clients.length,
      last_week_new_clients: clients.filter((item) => item.registeredAt >= weekAgo)
        .length,
      non_returning_clients: clients.filter(
        (item) => (metrics.get(item.id)?.visitsCount ?? 0) <= 1,
      ).length,
      birthdays_today_or_period: clients.filter((item) => {
        if (!item.birthDate) {
          return false;
        }
        return (
          item.birthDate.getMonth() === today.getMonth() &&
          item.birthDate.getDate() === today.getDate()
        );
      }).length,
    };
  }

  private async buildClientDashboard(id: string, context: ClientContext) {
    const orders = await this.prisma.order.findMany({
      where: this.completedOrderWhere(id, context),
      include: { items: true },
    });
    const visitsCount = orders.length;
    const totalPurchases = orders.reduce(
      (sum, order) => sum + this.decimalToNumber(order.totalPrice),
      0,
    );
    const topTransaction = orders.reduce(
      (max, order) => Math.max(max, this.decimalToNumber(order.totalPrice)),
      0,
    );
    const averageCheck = visitsCount ? totalPurchases / visitsCount : 0;
    const averageItemsCount = visitsCount
      ? orders.reduce((sum, order) => sum + order.items.length, 0) / visitsCount
      : 0;
    const averageDiscountPercent = visitsCount
      ? orders.reduce((sum, order) => {
          const total = this.decimalToNumber(order.totalPrice);
          const discount = this.decimalToNumber(order.discountAmount);
          const base = total + discount;
          return sum + (base > 0 ? (discount / base) * 100 : 0);
        }, 0) / visitsCount
      : 0;
    const client = await this.prisma.client.findUnique({
      where: { id },
      select: { balanceUzs: true },
    });

    return {
      balance_uzs: this.decimalToNumber(client?.balanceUzs),
      total_purchases_uzs: totalPurchases,
      top_transaction_uzs: topTransaction,
      average_check_uzs: averageCheck,
      average_items_count: averageItemsCount,
      average_discount_percent: averageDiscountPercent,
      visits_count: visitsCount,
    };
  }

  private toNoteResponse(note: {
    id: string;
    clientId: string;
    text: string;
    createdAt: Date;
    createdBy?: { id: number; firstName: string; lastName: string } | null;
  }) {
    return {
      id: note.id,
      client_id: note.clientId,
      text: note.text,
      created_by: note.createdBy
        ? {
            id: String(note.createdBy.id),
            name: `${note.createdBy.firstName} ${note.createdBy.lastName}`.trim(),
          }
        : null,
      created_at: note.createdAt.toISOString(),
    };
  }

  private buildFullName(client: {
    firstName: string;
    lastName?: string | null;
    middleName?: string | null;
  }) {
    return [client.lastName, client.firstName, client.middleName]
      .filter((part) => Boolean(part && part.trim()))
      .join(' ')
      .trim();
  }

  private toStringArray(value: Prisma.JsonValue | null | undefined) {
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  }

  private decimalToNumber(value: Prisma.Decimal | null | undefined) {
    return value ? Number(value) : 0;
  }

  private matchesDateRange(value: string, from: Date | null, to: Date | null) {
    const date = new Date(value);
    if (from && date < from) return false;
    if (to && date > to) return false;
    return true;
  }

  private parseStringArray(value: string | string[] | undefined) {
    if (!value) return [];
    const raw = Array.isArray(value) ? value : [value];
    return raw.flatMap((item) => item.split(',')).map((item) => item.trim()).filter(Boolean);
  }

  private parsePositiveInt(value: string | string[] | undefined, fallback: number) {
    const raw = Array.isArray(value) ? value[0] : value;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }

  private parseOptionalNumber(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === '') return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private requirePositiveNumber(value: unknown, field: string) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new BadRequestException(`${field} must be a positive number`);
    }
    return parsed;
  }

  private optionalString(value: string | string[] | undefined) {
    const raw = Array.isArray(value) ? value[0] : value;
    const trimmed = raw?.trim();
    return trimmed ? trimmed : null;
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(`${field} is required`);
    }
    return value.trim();
  }

  private parseDateOnly(value: string | string[] | undefined) {
    const raw = this.optionalString(value);
    if (!raw) return null;
    const parsed = new Date(`${raw}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date value: ${raw}`);
    }
    return parsed;
  }

  private parseDateTime(value: string | string[] | undefined) {
    const raw = this.optionalString(value);
    if (!raw) return null;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid datetime value: ${raw}`);
    }
    return parsed;
  }

  private parseNullableDateTime(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('Date value must be a string');
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid datetime value: ${value}`);
    }
    return parsed;
  }

  private toDateOnly(value: Date | null | undefined) {
    return value ? value.toISOString().slice(0, 10) : null;
  }

  private parseNullableGender(value: string | string[] | undefined) {
    const raw = this.optionalString(value);
    if (!raw) return null;
    if (!Object.values(ClientGender).includes(raw as ClientGender)) {
      throw new BadRequestException(`Invalid gender value: ${raw}`);
    }
    return raw as ClientGender;
  }

  private parseClientCardType(value: unknown) {
    if (typeof value !== 'string' || value === '') {
      return ClientCardType.local;
    }
    if (!Object.values(ClientCardType).includes(value as ClientCardType)) {
      throw new BadRequestException(`Invalid client card type: ${value}`);
    }
    return value as ClientCardType;
  }

  private parseBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    return fallback;
  }
}
