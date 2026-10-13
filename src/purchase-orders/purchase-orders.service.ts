import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { loadRoleAccess, roleAccessAllows } from '../auth/role-permissions';
import { runSerializableTransaction } from '../common/serializable-transaction';
import { moveVariantStock } from '../common/stock-ledger';
import { PrismaService } from '../prisma/prisma.service';

// Orders to suppliers ("Заказы поставщикам").
// DRAFT → SENT → PARTIAL → RECEIVED, or CANCELLED before anything arrived.
// Receiving posts the stock exactly like a committed supplier invoice: the
// variant ledger, a PURCHASE stock movement, the supply price and its history.

const EDITABLE: PurchaseOrderStatus[] = ['DRAFT'];
const RECEIVABLE: PurchaseOrderStatus[] = ['SENT', 'PARTIAL'];
const CANCELLABLE: PurchaseOrderStatus[] = ['DRAFT', 'SENT'];

type ItemInput = {
  productId: number;
  variantId: string | null;
  quantity: number;
  supplyPrice: number;
};

const orderInclude = {
  supplier: { select: { id: true, name: true, phone: true } },
  shop: { select: { id: true, name: true, branchCode: true } },
  items: { orderBy: { name: 'asc' as const } },
} satisfies Prisma.PurchaseOrderInclude;

type OrderWithRelations = Prisma.PurchaseOrderGetPayload<{
  include: typeof orderInclude;
}>;

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  private ctx(requestContext: CompanyRequestContext) {
    return requireCompanyContext(requestContext);
  }

  /** Sums are hidden from roles without "Возможность просмотра суммы заказа". */
  private async canViewSums(c: CompanyRequestContext) {
    if (!c.crmRoleId) return false;
    const access = await loadRoleAccess(this.prisma, c.crmRoleId, c.companyId);
    return Boolean(access && roleAccessAllows(access, ['order-all-sum']));
  }

  private scope(c: CompanyRequestContext): Prisma.PurchaseOrderWhereInput {
    return { companyId: c.companyId, shopId: { in: c.allowedShopIds } };
  }

  private async findOrThrow(
    client: Prisma.TransactionClient | PrismaService,
    id: string,
    c: CompanyRequestContext,
  ) {
    const order = await client.purchaseOrder.findFirst({
      where: { id, ...this.scope(c) },
      include: orderInclude,
    });
    if (!order) throw new NotFoundException('Заказ не найден');
    return order;
  }

  private parsePositive(value: unknown, field: string, allowZero = false) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || (!allowZero && number === 0)) {
      throw new BadRequestException(`Некорректное значение: ${field}`);
    }
    return Math.round(number * 1000) / 1000;
  }

  private parseItems(raw: unknown): ItemInput[] {
    if (!Array.isArray(raw) || !raw.length) {
      throw new BadRequestException('Добавьте хотя бы один товар в заказ');
    }
    const items = raw.map((item: any) => {
      const productId = Number(item?.product_id ?? item?.productId);
      if (!Number.isInteger(productId) || productId <= 0) {
        throw new BadRequestException('Некорректный товар в заказе');
      }
      const variant = item?.variant_id ?? item?.variantId;
      return {
        productId,
        variantId: variant ? String(variant) : null,
        quantity: this.parsePositive(item?.quantity, 'количество'),
        supplyPrice: this.parsePositive(item?.supply_price ?? item?.supplyPrice ?? 0, 'цена', true),
      };
    });
    const keys = new Set(items.map((item) => `${item.productId}:${item.variantId ?? ''}`));
    if (keys.size !== items.length) {
      throw new BadRequestException('Один и тот же товар добавлен в заказ дважды');
    }
    return items;
  }

  private async resolveSupplierAndShop(
    client: Prisma.TransactionClient | PrismaService,
    c: CompanyRequestContext,
    body: Record<string, unknown>,
    fallback?: { supplierId: number; shopId: string },
  ) {
    const supplierId =
      body.supplier_id !== undefined ? Number(body.supplier_id) : fallback?.supplierId;
    const shopId =
      body.shop_id !== undefined ? String(body.shop_id) : fallback?.shopId ?? c.currentShopId;
    if (!supplierId || !Number.isInteger(supplierId)) {
      throw new BadRequestException('Выберите поставщика');
    }
    if (!shopId) throw new BadRequestException('Выберите магазин');
    if (!c.allowedShopIds.includes(shopId)) {
      throw new ForbiddenException('Нет доступа к выбранному магазину');
    }
    const [supplier, shop] = await Promise.all([
      client.supplier.findFirst({ where: { id: supplierId, companyId: c.companyId } }),
      client.shop.findFirst({ where: { id: shopId, companyId: c.companyId } }),
    ]);
    if (!supplier) throw new BadRequestException('Поставщик не найден');
    if (!supplier.isActive) throw new BadRequestException('Поставщик отключён');
    if (!shop) throw new BadRequestException('Магазин не найден');
    return { supplierId, shopId };
  }

  /** Snapshots name/SKU/barcode and checks every product belongs to the company. */
  private async buildItemRows(
    client: Prisma.TransactionClient | PrismaService,
    c: CompanyRequestContext,
    items: ItemInput[],
  ) {
    const products = await client.product.findMany({
      where: { id: { in: items.map((item) => item.productId) }, companyId: c.companyId },
      select: { id: true, name: true, sku: true, barcode: true, purchasePrice: true },
    });
    const productById = new Map(products.map((product) => [product.id, product]));
    const variantIds = items.map((item) => item.variantId).filter((id): id is string => !!id);
    const variants = variantIds.length
      ? await client.productVariant.findMany({
          where: { id: { in: variantIds } },
          select: {
            id: true,
            productId: true,
            sku: true,
            barcode: true,
            color: { select: { name: true, nameRu: true } },
            size: { select: { name: true, nameRu: true } },
          },
        })
      : [];
    const variantById = new Map(variants.map((variant) => [variant.id, variant]));

    return items.map((item) => {
      const product = productById.get(item.productId);
      if (!product) throw new BadRequestException(`Товар ${item.productId} не найден`);
      const variant = item.variantId ? variantById.get(item.variantId) : null;
      if (item.variantId && (!variant || variant.productId !== product.id)) {
        throw new BadRequestException(`Вариант товара «${product.name}» не найден`);
      }
      const variantName = [variant?.color, variant?.size]
        .map((part) => (part?.nameRu || part?.name || '').trim())
        .filter(Boolean)
        .join(' / ');
      return {
        productId: product.id,
        variantId: variant?.id ?? null,
        name: variantName ? `${product.name} (${variantName})` : product.name,
        sku: variant?.sku || product.sku || null,
        barcode: variant?.barcode || product.barcode || null,
        quantity: new Prisma.Decimal(item.quantity),
        supplyPrice: new Prisma.Decimal(item.supplyPrice || product.purchasePrice || 0),
      };
    });
  }

  private async userNames(ids: Array<number | null | undefined>) {
    const unique = [...new Set(ids.filter((id): id is number => typeof id === 'number'))];
    if (!unique.length) return new Map<number, string>();
    const users = await this.prisma.user.findMany({
      where: { id: { in: unique } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((user) => [user.id, `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim()]),
    );
  }

  private toResponse(order: OrderWithRelations, names: Map<number, string>, showSums: boolean) {
    const quantity = order.items.reduce((sum, item) => sum + Number(item.quantity), 0);
    const received = order.items.reduce((sum, item) => sum + Number(item.receivedQuantity), 0);
    const amount = order.items.reduce(
      (sum, item) => sum + Number(item.quantity) * Number(item.supplyPrice),
      0,
    );
    const receivedAmount = order.items.reduce(
      (sum, item) => sum + Number(item.receivedQuantity) * Number(item.supplyPrice),
      0,
    );
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      supplier: order.supplier,
      shop: order.shop,
      comment: order.comment,
      expected_at: order.expectedAt ? order.expectedAt.toISOString().slice(0, 10) : null,
      created_at: order.createdAt.toISOString(),
      sent_at: order.sentAt?.toISOString() ?? null,
      received_at: order.receivedAt?.toISOString() ?? null,
      cancelled_at: order.cancelledAt?.toISOString() ?? null,
      cancel_reason: order.cancelReason,
      created_by: names.get(order.createdById) ?? '',
      received_by: order.receivedById ? names.get(order.receivedById) ?? '' : '',
      cancelled_by: order.cancelledById ? names.get(order.cancelledById) ?? '' : '',
      total_quantity: quantity,
      received_quantity: received,
      total_amount: showSums ? Math.round(amount * 100) / 100 : null,
      received_amount: showSums ? Math.round(receivedAmount * 100) / 100 : null,
      items: order.items.map((item) => ({
        id: item.id,
        product_id: item.productId,
        variant_id: item.variantId,
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: Number(item.quantity),
        received_quantity: Number(item.receivedQuantity),
        remaining_quantity: Math.max(0, Number(item.quantity) - Number(item.receivedQuantity)),
        supply_price: showSums ? Number(item.supplyPrice) : null,
      })),
    };
  }

  private async respond(order: OrderWithRelations, c: CompanyRequestContext) {
    const [names, showSums] = await Promise.all([
      this.userNames([order.createdById, order.receivedById, order.cancelledById]),
      this.canViewSums(c),
    ]);
    return this.toResponse(order, names, showSums);
  }

  async list(query: Record<string, string | undefined>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));
    const and: Prisma.PurchaseOrderWhereInput[] = [this.scope(c)];

    const status = String(query.status ?? '').toUpperCase();
    if ((Object.values(PurchaseOrderStatus) as string[]).includes(status)) {
      and.push({ status: status as PurchaseOrderStatus });
    }
    if (query.supplier_id && Number.isInteger(Number(query.supplier_id))) {
      and.push({ supplierId: Number(query.supplier_id) });
    }
    if (query.shop_id) and.push({ shopId: String(query.shop_id) });
    const search = String(query.search ?? '').trim();
    if (search) {
      const number = Number(search.replace(/^[^\d]+/, ''));
      and.push({
        OR: [
          ...(Number.isInteger(number) && number > 0 ? [{ number }] : []),
          { comment: { contains: search, mode: 'insensitive' } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
          { items: { some: { name: { contains: search, mode: 'insensitive' } } } },
          { items: { some: { barcode: search } } },
        ],
      });
    }

    const where = { AND: and };
    const [orders, total, counts, showSums] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: orderInclude,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
      this.prisma.purchaseOrder.groupBy({
        by: ['status'],
        where: this.scope(c),
        _count: { _all: true },
      }),
      this.canViewSums(c),
    ]);
    const names = await this.userNames(
      orders.flatMap((order) => [order.createdById, order.receivedById, order.cancelledById]),
    );
    return {
      items: orders.map((order) => this.toResponse(order, names, showSums)),
      total,
      page,
      limit,
      status_counts: Object.fromEntries(counts.map((row) => [row.status, row._count._all])),
    };
  }

  async get(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    return this.respond(await this.findOrThrow(this.prisma, id, c), c);
  }

  async create(body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    const items = this.parseItems(body.items);
    const order = await runSerializableTransaction(this.prisma, async (tx) => {
      const { supplierId, shopId } = await this.resolveSupplierAndShop(tx, c, body);
      const rows = await this.buildItemRows(tx, c, items);
      return tx.purchaseOrder.create({
        data: {
          companyId: c.companyId,
          supplierId,
          shopId,
          comment: this.optionalText(body.comment),
          expectedAt: this.optionalDate(body.expected_at),
          createdById: c.userId,
          items: { create: rows },
        },
        include: orderInclude,
      });
    });
    return this.respond(order, c);
  }

  async update(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    const order = await runSerializableTransaction(this.prisma, async (tx) => {
      const current = await this.findOrThrow(tx, id, c);
      if (!EDITABLE.includes(current.status)) {
        throw new ConflictException('Изменять можно только черновик заказа');
      }
      const { supplierId, shopId } = await this.resolveSupplierAndShop(tx, c, body, current);
      const data: Prisma.PurchaseOrderUncheckedUpdateInput = { supplierId, shopId };
      if (body.comment !== undefined) data.comment = this.optionalText(body.comment);
      if (body.expected_at !== undefined) data.expectedAt = this.optionalDate(body.expected_at);
      if (body.items !== undefined) {
        const rows = await this.buildItemRows(tx, c, this.parseItems(body.items));
        await tx.purchaseOrderItem.deleteMany({ where: { orderId: id } });
        data.items = { create: rows } as any;
      }
      return tx.purchaseOrder.update({ where: { id }, data, include: orderInclude });
    });
    return this.respond(order, c);
  }

  async send(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    await this.findOrThrow(this.prisma, id, c);
    const changed = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'SENT', sentAt: new Date() },
    });
    if (!changed.count) throw new ConflictException('Отправить можно только черновик');
    return this.get(id, c);
  }

  async cancel(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    const reason = this.optionalText(body.reason ?? body.cancel_reason);
    if (!reason || reason.length < 3) {
      throw new BadRequestException('Укажите причину отмены заказа');
    }
    await this.findOrThrow(this.prisma, id, c);
    const changed = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: { in: CANCELLABLE } },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledById: c.userId,
        cancelReason: reason,
      },
    });
    if (!changed.count) {
      throw new ConflictException('Заказ, по которому уже принят товар, отменить нельзя');
    }
    return this.get(id, c);
  }

  /** Ends a partly received order: what did not arrive is not expected any more. */
  async close(id: string, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    await this.findOrThrow(this.prisma, id, c);
    const changed = await this.prisma.purchaseOrder.updateMany({
      where: { id, status: 'PARTIAL' },
      data: { status: 'RECEIVED', receivedAt: new Date(), receivedById: c.userId },
    });
    if (!changed.count) throw new ConflictException('Закрыть можно только частично принятый заказ');
    return this.get(id, c);
  }

  /**
   * Accepts delivered quantities (all remaining when no items are given).
   * Each line may correct the supply price to the one on the delivery note.
   */
  async receive(id: string, body: Record<string, unknown>, requestContext: CompanyRequestContext) {
    const c = this.ctx(requestContext);
    const order = await runSerializableTransaction(this.prisma, async (tx) => {
      // Lock the order: two receptions at once must not post the stock twice.
      await tx.$queryRaw`SELECT id FROM "PurchaseOrder" WHERE id = ${id} FOR UPDATE`;
      const current = await this.findOrThrow(tx, id, c);
      if (!RECEIVABLE.includes(current.status)) {
        throw new ConflictException(
          current.status === 'DRAFT'
            ? 'Сначала отправьте заказ поставщику'
            : 'Этот заказ уже нельзя принимать',
        );
      }

      const requested = new Map<string, { quantity: number; supplyPrice?: number }>();
      if (Array.isArray(body.items)) {
        for (const raw of body.items as any[]) {
          const itemId = String(raw?.item_id ?? raw?.id ?? '');
          const quantity = this.parsePositive(raw?.quantity ?? 0, 'количество', true);
          const price =
            raw?.supply_price !== undefined && raw?.supply_price !== null && raw?.supply_price !== ''
              ? this.parsePositive(raw.supply_price, 'цена', true)
              : undefined;
          requested.set(itemId, { quantity, supplyPrice: price });
        }
      }
      const lines = current.items
        .map((item) => {
          const remaining = Number(item.quantity) - Number(item.receivedQuantity);
          const request = Array.isArray(body.items)
            ? requested.get(item.id)
            : { quantity: remaining };
          return { item, remaining, quantity: request?.quantity ?? 0, supplyPrice: request?.supplyPrice };
        })
        .filter((line) => line.quantity > 0);

      for (const [itemId] of requested) {
        if (!current.items.some((item) => item.id === itemId)) {
          throw new BadRequestException('Позиция не относится к этому заказу');
        }
      }
      if (!lines.length) throw new BadRequestException('Укажите принятое количество');
      for (const line of lines) {
        if (line.quantity > line.remaining + 0.0005) {
          throw new BadRequestException(
            `«${line.item.name}»: принимается больше, чем осталось по заказу (${line.remaining})`,
          );
        }
      }

      const company = await tx.company.findUnique({
        where: { id: c.companyId },
        select: { supplyPriceStrategy: true },
      });
      const strategy = company?.supplyPriceStrategy || 'LAST_PURCHASE';
      const touched = new Map<number, number>();

      for (const line of lines) {
        const product = await tx.product.findFirst({
          where: { id: line.item.productId, companyId: c.companyId },
        });
        if (!product) throw new NotFoundException(`Товар «${line.item.name}» не найден`);
        const price = line.supplyPrice ?? Number(line.item.supplyPrice);
        const stock = await tx.productStock.findFirst({
          where: { productId: product.id, shopId: current.shopId },
        });
        const previousPrice = Number(stock?.purchasePrice ?? product.purchasePrice ?? 0);
        const before = Number(stock?.quantity ?? 0);
        const nextPrice =
          strategy === 'WEIGHTED_AVERAGE' && before + line.quantity > 0
            ? (before * previousPrice + line.quantity * price) / (before + line.quantity)
            : strategy === 'MANUAL'
              ? Number(stock?.purchasePrice ?? product.purchasePrice ?? price)
              : price;

        const move = await moveVariantStock(tx, {
          companyId: c.companyId,
          shopId: current.shopId,
          branchCode: current.shop.branchCode,
          productId: product.id,
          variantId: line.item.variantId,
          delta: line.quantity,
          prices: { purchasePrice: nextPrice, salePrice: product.salePrice },
        });
        await tx.productStock.updateMany({
          where: { productId: product.id, shopId: current.shopId },
          data: { purchasePrice: nextPrice },
        });
        await tx.productVariantStock.updateMany({
          where: { variantId: move.variantId, shopId: current.shopId },
          data: { purchasePrice: nextPrice },
        });
        await tx.stockMovement.create({
          data: {
            companyId: c.companyId,
            shopId: current.shopId,
            productId: product.id,
            variantId: move.variantId,
            type: 'PURCHASE',
            displayTypeCode: 'purchase_order',
            displayTypeLabel: `Приход по заказу №${current.number}`,
            externalId: current.id,
            quantity: line.quantity,
            beforeQuantity: move.beforeQuantity,
            afterQuantity: move.afterQuantity,
            fromShopId: current.shopId,
            toShopId: current.shopId,
            supplyPrice: price,
            fromSupplyPrice: previousPrice,
            retailPrice: Number(product.salePrice ?? 0),
            createdById: c.userId,
          },
        });
        if (nextPrice !== previousPrice) {
          await tx.productSupplyPriceHistory.create({
            data: {
              productId: product.id,
              variantId: move.variantId,
              shopId: current.shopId,
              supplyPrice: nextPrice,
              oldSupplyPrice: previousPrice,
              createdById: c.userId,
            },
          });
        }
        await tx.purchaseOrderItem.update({
          where: { id: line.item.id },
          data: {
            receivedQuantity: { increment: new Prisma.Decimal(line.quantity) },
            ...(line.supplyPrice !== undefined ? { supplyPrice: new Prisma.Decimal(price) } : {}),
          },
        });
        // The product is now known to come from this supplier.
        await tx.productSupplier.upsert({
          where: { productId_supplierId: { productId: product.id, supplierId: current.supplierId } },
          create: { productId: product.id, supplierId: current.supplierId },
          update: {},
        });
        touched.set(product.id, price);
      }

      for (const [productId, lastPrice] of touched) {
        const stocks = await tx.productStock.findMany({
          where: { productId },
          select: { quantity: true, purchasePrice: true },
        });
        const quantity = stocks.reduce((sum, row) => sum + Number(row.quantity), 0);
        const data: Prisma.ProductUpdateInput = {};
        if (strategy === 'LAST_PURCHASE') data.purchasePrice = lastPrice;
        if (strategy === 'WEIGHTED_AVERAGE' && quantity > 0) {
          data.purchasePrice =
            stocks.reduce((sum, row) => sum + Number(row.quantity) * Number(row.purchasePrice ?? 0), 0) /
            quantity;
        }
        if (Object.keys(data).length) await tx.product.update({ where: { id: productId }, data });
      }

      const refreshed = await tx.purchaseOrderItem.findMany({ where: { orderId: id } });
      const complete = refreshed.every(
        (item) => Number(item.receivedQuantity) + 0.0005 >= Number(item.quantity),
      );
      await tx.purchaseOrder.update({
        where: { id },
        data: complete
          ? { status: 'RECEIVED', receivedAt: new Date(), receivedById: c.userId }
          : { status: 'PARTIAL', receivedById: c.userId },
      });
      await tx.auditLog.create({
        data: {
          companyId: c.companyId,
          userId: c.userId,
          action: 'purchase_order.received',
          entity: 'PurchaseOrder',
          entityId: id,
          meta: lines.map((line) => ({
            itemId: line.item.id,
            productId: line.item.productId,
            quantity: line.quantity,
            supplyPrice: line.supplyPrice ?? Number(line.item.supplyPrice),
          })),
        },
      });
      return this.findOrThrow(tx, id, c);
    });
    return this.respond(order, c);
  }

  private optionalText(value: unknown) {
    const text = String(value ?? '').trim();
    return text ? text.slice(0, 1000) : null;
  }

  private optionalDate(value: unknown) {
    if (value === null || value === undefined || value === '') return null;
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) throw new BadRequestException('Некорректная дата');
    return date;
  }
}
