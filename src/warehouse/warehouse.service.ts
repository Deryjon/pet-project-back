import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class WarehouseService {
  constructor(
    private readonly db: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private async context(auth?: string) {
    const context = await this.usersService.getRequestContext(auth);
    if (context.userType !== 'company' || !context.companyId) {
      throw new ForbiddenException('Company context required');
    }
    return { ...context, companyId: context.companyId };
  }

  private scope(context: { companyId: string; allowedShopIds: string[] }) {
    return {
      companyId: context.companyId,
      shopId: { in: context.allowedShopIds },
    };
  }

  async listMovements(
    type: string,
    query: Record<string, string>,
    auth?: string,
  ) {
    const context = await this.context(auth);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);
    const search = query.search?.trim();

    const where: any = { type, ...this.scope(context) };
    if (search) {
      where.product = {
        name: { contains: search, mode: 'insensitive' },
      };
    }

    const [items, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          product: {
            select: { id: true, name: true, sku: true, barcode: true },
          },
          shop: { select: { id: true, name: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.stockMovement.count({ where }),
    ]);

    return {
      items: items.map((item) => ({
        id: item.id,
        name: item.product?.name ?? '',
        sku: item.product?.sku ?? '',
        barcode: item.product?.barcode ?? '',
        store: item.shop?.name ?? '',
        qty: Number(item.quantity),
        amount: Number(item.retailPrice) * Number(item.quantity),
        supplyPrice: Number(item.supplyPrice),
        retailPrice: Number(item.retailPrice),
        type: item.displayTypeLabel || item.type,
        status: 'completed',
        user: item.createdBy
          ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim()
          : '',
        createdAt: item.createdAt.toISOString(),
        externalId: item.externalId,
      })),
      total,
      page,
      limit,
    };
  }

  async listRevaluations(query: Record<string, string>, auth?: string) {
    const context = await this.context(auth);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);

    const where: any = this.scope(context);

    const [items, total] = await Promise.all([
      this.db.stockMovement.findMany({
        where,
        include: {
          product: { select: { id: true, name: true, sku: true } },
          shop: { select: { id: true, name: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.stockMovement.count({ where }),
    ]);

    return {
      items: items
        .filter(
          (item) =>
            Number(item.newRetailPrice) !== Number(item.fromRetailPrice),
        )
        .map((item) => ({
          id: item.id,
          name: item.product?.name ?? '',
          store: item.shop?.name ?? '',
          type: item.displayTypeLabel || 'Переоценка',
          qty: Number(item.quantity),
          oldPrice: Number(item.fromRetailPrice),
          newPrice: Number(item.newRetailPrice),
          status: 'completed',
          user: item.createdBy
            ? `${item.createdBy.firstName} ${item.createdBy.lastName}`.trim()
            : '',
          revaluatedAt: item.createdAt.toISOString(),
        })),
      total,
      page,
      limit,
    };
  }

  async listInventorySessions(query: Record<string, string>, auth?: string) {
    const context = await this.context(auth);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);
    const where: any = this.scope(context);
    if (query.status) where.status = query.status;

    const [items, total] = await Promise.all([
      this.db.inventorySession.findMany({
        where,
        include: {
          shop: { select: { id: true, name: true } },
          createdBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          closedBy: {
            select: { id: true, firstName: true, lastName: true },
          },
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.db.inventorySession.count({ where }),
    ]);

    return {
      items: items.map((s) => ({
        id: s.id,
        name: s.name,
        store: s.shop?.name ?? '',
        shopId: s.shopId,
        status: s.status,
        itemsCount: s._count.items,
        comment: s.comment,
        createdBy: s.createdBy
          ? `${s.createdBy.firstName} ${s.createdBy.lastName}`.trim()
          : '',
        closedBy: s.closedBy
          ? `${s.closedBy.firstName} ${s.closedBy.lastName}`.trim()
          : '',
        createdAt: s.createdAt.toISOString(),
        closedAt: s.closedAt?.toISOString() ?? null,
      })),
      total,
      page,
      limit,
    };
  }

  async getInventorySession(id: string, auth?: string) {
    const context = await this.context(auth);
    const session = await this.db.inventorySession.findFirst({
      where: { id, ...this.scope(context) },
      include: {
        shop: { select: { id: true, name: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            product: {
              select: { id: true, name: true, sku: true, barcode: true },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!session) throw new NotFoundException('Inventory session not found');
    return {
      ...session,
      items: session.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        productName: item.product?.name ?? '',
        sku: item.product?.sku ?? '',
        barcode: item.product?.barcode ?? '',
        expectedQuantity: item.expectedQuantity,
        actualQuantity: item.actualQuantity,
        difference: item.difference,
      })),
    };
  }

  async createInventorySession(body: Record<string, unknown>, auth?: string) {
    const context = await this.context(auth);
    if (!context?.companyId || !context?.userId)
      throw new BadRequestException('Auth required');
    const shopId = String(body.shop_id || '').trim();
    if (!shopId) throw new BadRequestException('shop_id required');
    if (!context.allowedShopIds.includes(shopId))
      throw new ForbiddenException('Shop is not available');
    const shop = await this.db.shop.findFirst({
      where: { id: shopId, companyId: context.companyId },
    });
    if (!shop) throw new NotFoundException('Shop not found');

    const session = await this.db.inventorySession.create({
      data: {
        companyId: context.companyId,
        shopId,
        name: String(
          body.name ||
            `Инвентаризация ${new Date().toLocaleDateString('ru-RU')}`,
        ).trim(),
        comment: String(body.comment || '').trim(),
        createdById: context.userId,
      },
      include: { shop: { select: { name: true } } },
    });

    return {
      id: session.id,
      name: session.name,
      store: session.shop?.name ?? '',
      status: session.status,
    };
  }

  async addInventoryItem(
    sessionId: string,
    body: Record<string, unknown>,
    auth?: string,
  ) {
    const context = await this.context(auth);
    const session = await this.db.inventorySession.findFirst({
      where: { id: sessionId, ...this.scope(context) },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'draft')
      throw new BadRequestException('Session is not in draft status');

    const productId = Number(body.product_id);
    if (!Number.isInteger(productId) || productId <= 0)
      throw new BadRequestException('product_id is invalid');
    const actualQuantity = Number(body.actual_quantity ?? 0);
    if (!Number.isFinite(actualQuantity) || actualQuantity < 0)
      throw new BadRequestException('actual_quantity is invalid');
    const product = await this.db.product.findFirst({
      where: { id: productId, companyId: context.companyId, archivedAt: null },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const shop = await this.db.shop.findUnique({
      where: { id: session.shopId },
      select: { branchCode: true },
    });
    const stock = await this.db.productStock.findFirst({
      where: {
        productId,
        branchCode: shop?.branchCode ?? '',
      },
    });
    const expectedQuantity = stock?.quantity ?? 0;

    const item = await this.db.inventoryItem.upsert({
      where: {
        inventorySessionId_productId: {
          inventorySessionId: sessionId,
          productId,
        },
      },
      update: {
        actualQuantity,
        difference: actualQuantity - expectedQuantity,
        expectedQuantity,
      },
      create: {
        inventorySessionId: sessionId,
        productId,
        expectedQuantity,
        actualQuantity,
        difference: actualQuantity - expectedQuantity,
      },
      include: {
        product: {
          select: { id: true, name: true, sku: true, barcode: true },
        },
      },
    });

    return {
      id: item.id,
      productId: item.productId,
      productName: item.product?.name,
      expectedQuantity: item.expectedQuantity,
      actualQuantity: item.actualQuantity,
      difference: item.difference,
    };
  }

  async applyInventory(sessionId: string, auth?: string) {
    const context = await this.context(auth);
    const session = await this.db.inventorySession.findFirst({
      where: { id: sessionId, ...this.scope(context) },
      include: {
        items: true,
        shop: { select: { branchCode: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'draft')
      throw new BadRequestException('Already applied');

    const branchCode = session.shop?.branchCode ?? '';
    await this.db.$transaction(async (tx) => {
      for (const item of session.items) {
        const stock = await tx.productStock.findFirst({
          where: { productId: item.productId, branchCode },
        });
        if (stock) {
          await tx.productStock.update({
            where: { id: stock.id },
            data: { quantity: item.actualQuantity },
          });
        }
        const totalStock = await tx.productStock.aggregate({
          where: { productId: item.productId },
          _sum: { quantity: true },
        });
        await tx.product.update({
          where: { id: item.productId },
          data: { quantity: totalStock._sum.quantity ?? 0 },
        });
      }
      await tx.inventorySession.update({
        where: { id: sessionId },
        data: {
          status: 'completed',
          closedById: context?.userId,
          closedAt: new Date(),
        },
      });
    });

    return { success: true, id: sessionId, status: 'completed' };
  }
}
