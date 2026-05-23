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

  async createClient(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const shopId = await this.resolveRegistrationShopId(
      body.registration_shop_id,
      context,
    );
    const groupIds = await this.resolveGroupIds(body.group_ids, context.companyId);
    const tagIds = await this.resolveTagIds(body.tag_ids, context.companyId);
    const client = await this.prisma.$transaction(async (tx) => {
      const created = await tx.client.create({
        data: {
          companyId: context.companyId,
          code: await this.generateClientCode(context.companyId, tx),
          firstName: this.requireString(body.first_name, 'first_name'),
          lastName: this.optionalBodyString(body.last_name),
          middleName: this.optionalBodyString(body.middle_name),
          phone: this.requireString(body.phone, 'phone'),
          gender: this.parseBodyGender(body.gender),
          birthDate: this.parseNullableDateOnly(body.birth_date),
          maritalStatus: this.optionalBodyString(body.marital_status),
          address: this.optionalBodyString(body.address),
          socialLinks: this.parseStringArrayBody(body.social_links),
          relatives: this.parseStringArrayBody(body.relatives),
          registrationShopId: shopId,
          registeredAt:
            this.parseNullableDateTime(body.registered_at) ?? new Date(),
          balanceUzs: this.toDecimal(body.balance_uzs),
          debtUzs: new Prisma.Decimal(0),
          totalPurchasesUzs: this.toDecimal(body.total_purchases_uzs),
          lastPurchaseAt: this.parseNullableDateTime(body.last_purchase_at),
          visitsCount: this.parseBodyInt(body.visits_count, 0),
          smsNotifications: this.parseBoolean(body.sms_notifications, false),
          phoneNotifications: this.parseBoolean(
            body.phone_notifications,
            false,
          ),
          socialNotifications: this.parseBoolean(
            body.social_notifications,
            false,
          ),
          emailNotifications: this.parseBoolean(
            body.email_notifications,
            false,
          ),
          groups: groupIds.length
            ? {
                create: groupIds.map((groupId) => ({ groupId })),
              }
            : undefined,
          tags: tagIds.length
            ? {
                create: tagIds.map((tagId) => ({ tagId })),
              }
            : undefined,
        },
      });

      return created;
    });

    return this.findOne(client.id, authorization);
  }

  async updateClient(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(id, context.companyId);
    const shopId =
      body.registration_shop_id !== undefined
        ? await this.resolveRegistrationShopId(body.registration_shop_id, context)
        : undefined;
    const groupIds =
      body.group_ids !== undefined
        ? await this.resolveGroupIds(body.group_ids, context.companyId)
        : null;
    const tagIds =
      body.tag_ids !== undefined
        ? await this.resolveTagIds(body.tag_ids, context.companyId)
        : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id },
        data: {
          ...(body.first_name !== undefined
            ? { firstName: this.requireString(body.first_name, 'first_name') }
            : {}),
          ...(body.last_name !== undefined
            ? { lastName: this.optionalBodyString(body.last_name) }
            : {}),
          ...(body.middle_name !== undefined
            ? { middleName: this.optionalBodyString(body.middle_name) }
            : {}),
          ...(body.phone !== undefined
            ? { phone: this.requireString(body.phone, 'phone') }
            : {}),
          ...(body.gender !== undefined
            ? { gender: this.parseBodyGender(body.gender) }
            : {}),
          ...(body.birth_date !== undefined
            ? { birthDate: this.parseNullableDateOnly(body.birth_date) }
            : {}),
          ...(body.marital_status !== undefined
            ? { maritalStatus: this.optionalBodyString(body.marital_status) }
            : {}),
          ...(body.address !== undefined
            ? { address: this.optionalBodyString(body.address) }
            : {}),
          ...(body.social_links !== undefined
            ? { socialLinks: this.parseStringArrayBody(body.social_links) }
            : {}),
          ...(body.relatives !== undefined
            ? { relatives: this.parseStringArrayBody(body.relatives) }
            : {}),
          ...(body.registration_shop_id !== undefined
            ? { registrationShopId: shopId }
            : {}),
          ...(body.registered_at !== undefined
            ? { registeredAt: this.parseNullableDateTime(body.registered_at) ?? new Date() }
            : {}),
          ...(body.balance_uzs !== undefined
            ? { balanceUzs: this.toDecimal(body.balance_uzs) }
            : {}),
          ...(body.sms_notifications !== undefined
            ? { smsNotifications: this.parseBoolean(body.sms_notifications, false) }
            : {}),
          ...(body.phone_notifications !== undefined
            ? { phoneNotifications: this.parseBoolean(body.phone_notifications, false) }
            : {}),
          ...(body.social_notifications !== undefined
            ? { socialNotifications: this.parseBoolean(body.social_notifications, false) }
            : {}),
          ...(body.email_notifications !== undefined
            ? { emailNotifications: this.parseBoolean(body.email_notifications, false) }
            : {}),
        },
      });

      if (groupIds !== null) {
        await tx.clientGroupLink.deleteMany({ where: { clientId: id } });
        if (groupIds.length) {
          await tx.clientGroupLink.createMany({
            data: groupIds.map((groupId) => ({ clientId: id, groupId })),
          });
        }
      }

      if (tagIds !== null) {
        await tx.clientTagLink.deleteMany({ where: { clientId: id } });
        if (tagIds.length) {
          await tx.clientTagLink.createMany({
            data: tagIds.map((tagId) => ({ clientId: id, tagId })),
          });
        }
      }
    });

    return this.findOne(id, authorization);
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

  async createDebt(
    clientId: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    await this.findClientOrThrow(clientId, context.companyId);
    const shopId =
      body.shop_id !== undefined
        ? await this.resolveDebtShopId(body.shop_id, context)
        : null;
    const amount = this.toDecimal(body.amount_uzs);
    const debt = await this.prisma.$transaction(async (tx) => {
      const created = await tx.clientDebt.create({
        data: {
          companyId: context.companyId,
          clientId,
          shopId,
          amountUzs: amount,
          remainingAmountUzs: amount,
          repaidAmountUzs: new Prisma.Decimal(0),
          dueDate: this.parseNullableDateOnly(body.due_date),
          status: ClientDebtStatus.unpaid,
          receiptUrl: this.optionalBodyString(body.receipt_url),
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
      return created;
    });

    return {
      id: debt.id,
      client_id: debt.clientId,
      amount_uzs: this.decimalToNumber(debt.amountUzs),
      remaining_amount_uzs: this.decimalToNumber(debt.remainingAmountUzs),
      repaid_amount_uzs: this.decimalToNumber(debt.repaidAmountUzs),
      due_date: this.toDateOnly(debt.dueDate),
      status: debt.status,
      shop: null,
      created_at: debt.createdAt.toISOString(),
      receipt_url: debt.receiptUrl,
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

  async createGroup(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const group = await this.prisma.clientGroup.create({
      data: {
        companyId: context.companyId,
        name: this.requireString(body.name, 'name'),
      },
    });

    return { id: group.id, name: group.name };
  }

  async getTags(authorization?: string) {
    const context = await this.getContext(authorization);
    const tags = await this.prisma.clientTag.findMany({
      where: { companyId: context.companyId },
      orderBy: { name: 'asc' },
    });

    return tags.map((tag) => ({ id: tag.id, name: tag.name }));
  }

  async createTag(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const tag = await this.prisma.clientTag.create({
      data: {
        companyId: context.companyId,
        name: this.requireString(body.name, 'name'),
      },
    });

    return { id: tag.id, name: tag.name };
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

  private async generateClientCode(companyId: string, tx: Prisma.TransactionClient) {
    const count = await tx.client.count({
      where: { companyId },
    });
    return String(100000000000 + count + 1);
  }

  private async resolveRegistrationShopId(
    input: unknown,
    context: ClientContext,
  ) {
    const shopId = this.optionalBodyString(input);
    if (!shopId) {
      return null;
    }
    if (
      context.allowedShopIds.length &&
      !context.allowedShopIds.includes(shopId)
    ) {
      throw new BadRequestException('registration_shop_id is not accessible');
    }
    const shop = await this.prisma.shop.findFirst({
      where: {
        id: shopId,
        companyId: context.companyId,
      },
      select: { id: true },
    });
    if (!shop) {
      throw new BadRequestException('registration_shop_id is invalid');
    }
    return shop.id;
  }

  private async resolveDebtShopId(input: unknown, context: ClientContext) {
    const shopId = this.optionalBodyString(input);
    if (!shopId) {
      return null;
    }
    return this.resolveRegistrationShopId(shopId, context);
  }

  private async resolveGroupIds(input: unknown, companyId: string) {
    const ids = this.parseIdArrayBody(input);
    if (!ids.length) {
      return [];
    }
    const groups = await this.prisma.clientGroup.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true },
    });
    if (groups.length !== ids.length) {
      throw new BadRequestException('Some group_ids are invalid');
    }
    return ids;
  }

  private async resolveTagIds(input: unknown, companyId: string) {
    const ids = this.parseIdArrayBody(input);
    if (!ids.length) {
      return [];
    }
    const tags = await this.prisma.clientTag.findMany({
      where: { companyId, id: { in: ids } },
      select: { id: true },
    });
    if (tags.length !== ids.length) {
      throw new BadRequestException('Some tag_ids are invalid');
    }
    return ids;
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

  private optionalBodyString(value: unknown) {
    if (typeof value !== 'string') {
      return null;
    }
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }

  private parseBodyGender(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return ClientGender.unknown;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('gender must be a string');
    }
    if (!Object.values(ClientGender).includes(value as ClientGender)) {
      throw new BadRequestException(`Invalid gender value: ${value}`);
    }
    return value as ClientGender;
  }

  private parseNullableDateOnly(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return null;
    }
    if (typeof value !== 'string') {
      throw new BadRequestException('Date value must be a string');
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`Invalid date value: ${value}`);
    }
    return parsed;
  }

  private parseStringArrayBody(value: unknown) {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException('Expected array value');
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseIdArrayBody(value: unknown) {
    if (value === undefined || value === null) {
      return [];
    }
    if (!Array.isArray(value)) {
      throw new BadRequestException('Expected array value');
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private toDecimal(value: unknown) {
    if (value === undefined || value === null || value === '') {
      return new Prisma.Decimal(0);
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Numeric value is invalid');
    }
    return new Prisma.Decimal(parsed);
  }

  private parseBodyInt(value: unknown, fallback: number) {
    if (value === undefined || value === null || value === '') {
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      throw new BadRequestException('Integer value is invalid');
    }
    return Math.max(0, Math.floor(parsed));
  }
}
