import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { runSerializableTransaction } from '../common/serializable-transaction';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WarehouseService {
  constructor(private readonly db: PrismaService) {}

  private async context(requestContext: CompanyRequestContext) {
    return requireCompanyContext(requestContext);
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
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
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

  async listRevaluations(
    query: Record<string, string>,
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Math.max(1, Number(query.limit) || 10), 100);

    const where: any = {
      ...this.scope(context),
      newRetailPrice: {
        not: this.db.stockMovement.fields.fromRetailPrice,
      },
    };

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
      items: items.map((item) => ({
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

  async listInventorySessions(
    query: Record<string, string>,
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
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

  async getInventorySession(id: string, requestContext: CompanyRequestContext) {
    const context = await this.context(requestContext);
    const session = await this.db.inventorySession.findFirst({
      where: { id, ...this.scope(context) },
      include: {
        shop: { select: { id: true, name: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        items: {
          include: {
            variant: { include: { color: true, size: true } },
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
        variantId: item.variantId,
        productName: item.variant
          ? `${item.product?.name ?? ''} — ${[item.variant.color?.name, item.variant.size?.name].filter(Boolean).join(' / ')}`
          : item.product?.name ?? '',
        sku: item.variant?.sku ?? item.product?.sku ?? '',
        barcode: item.variant?.barcode ?? item.product?.barcode ?? '',
        expectedQuantity: item.expectedQuantity,
        actualQuantity: item.actualQuantity,
        difference: item.difference,
      })),
    };
  }

  async createInventorySession(
    body: Record<string, unknown>,
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
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
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
    const session = await this.db.inventorySession.findFirst({
      where: { id: sessionId, ...this.scope(context) },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status !== 'draft')
      throw new BadRequestException('Session is not in draft status');

    const productId = Number(body.product_id);
    const variantId = String(body.variant_id ?? '').trim() || null;
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
    const variant = variantId
      ? await this.db.productVariant.findFirst({
          where: { id: variantId, productId, companyId: context.companyId, isActive: true },
          include: { color: true, size: true },
        })
      : null;
    if (variantId && !variant) throw new NotFoundException('Product variant not found');

    const shop = await this.db.shop.findUnique({
      where: { id: session.shopId },
      select: { branchCode: true },
    });
    const stock = variantId
      ? await this.db.productVariantStock.findFirst({
          where: { variantId, branchCode: shop?.branchCode ?? '' },
        })
      : await this.db.productStock.findFirst({
          where: { productId, branchCode: shop?.branchCode ?? '' },
        });
    const expectedQuantity = stock?.quantity ?? 0;

    const existingItem = await this.db.inventoryItem.findFirst({
      where: { inventorySessionId: sessionId, productId, variantId },
    });
    const item = existingItem
      ? await this.db.inventoryItem.update({
          where: { id: existingItem.id },
          data: {
            actualQuantity,
            difference: actualQuantity - expectedQuantity,
            expectedQuantity,
          },
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { include: { color: true, size: true } },
          },
        })
      : await this.db.inventoryItem.create({
          data: {
            inventorySessionId: sessionId,
            productId,
            variantId,
            expectedQuantity,
            actualQuantity,
            difference: actualQuantity - expectedQuantity,
          },
          include: {
            product: { select: { id: true, name: true, sku: true, barcode: true } },
            variant: { include: { color: true, size: true } },
          },
        });

    return {
      id: item.id,
      productId: item.productId,
      variantId: item.variantId,
      productName: item.variant
        ? `${item.product?.name ?? ''} — ${[item.variant.color?.name, item.variant.size?.name].filter(Boolean).join(' / ')}`
        : item.product?.name,
      expectedQuantity: item.expectedQuantity,
      actualQuantity: item.actualQuantity,
      difference: item.difference,
    };
  }

  async applyInventory(
    sessionId: string,
    requestContext: CompanyRequestContext,
  ) {
    const context = await this.context(requestContext);
    await runSerializableTransaction(this.db, async (tx) => {
      const session = await tx.inventorySession.findFirst({
        where: { id: sessionId, ...this.scope(context) },
        include: {
          items: true,
          shop: { select: { branchCode: true } },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'draft')
        throw new BadRequestException('Already applied');

      const claimed = await tx.inventorySession.updateMany({
        where: {
          id: sessionId,
          ...this.scope(context),
          status: 'draft',
        },
        data: { status: 'applying' },
      });
      if (claimed.count !== 1) {
        throw new ConflictException('Inventory is already being applied');
      }

      const branchCode = session.shop?.branchCode?.trim();
      if (!branchCode) {
        throw new ConflictException('Inventory shop has no branch code');
      }

      for (const item of session.items) {
        if (
          !Number.isInteger(item.productId) ||
          item.productId <= 0 ||
          !Number.isFinite(item.actualQuantity) ||
          item.actualQuantity < 0
        ) {
          throw new BadRequestException('Inventory item is invalid');
        }

        const product = await tx.product.findFirst({
          where: {
            id: item.productId,
            companyId: context.companyId,
            archivedAt: null,
          },
          select: { id: true },
        });
        if (!product) throw new NotFoundException('Product not found');

        const stocks = await tx.productStock.findMany({
          where: { productId: item.productId, branchCode },
          orderBy: { id: 'asc' },
          take: 2,
        });
        if (stocks.length > 1) {
          throw new ConflictException(
            'Duplicate product stock rows must be repaired before inventory',
          );
        }

        const stock = stocks[0];
        let beforeQuantity = Number(stock?.quantity ?? 0);
        let afterQuantity = item.actualQuantity;
        let difference = item.actualQuantity - beforeQuantity;

        if (item.variantId) {
          const variant = await tx.productVariant.findFirst({
            where: {
              id: item.variantId,
              productId: item.productId,
              companyId: context.companyId,
              isActive: true,
            },
            select: { id: true },
          });
          if (!variant) throw new NotFoundException('Product variant not found');

          const variantStocks = await tx.productVariantStock.findMany({
            where: { variantId: item.variantId, branchCode },
            orderBy: { id: 'asc' },
            take: 2,
          });
          if (variantStocks.length > 1) {
            throw new ConflictException(
              'Duplicate variant stock rows must be repaired before inventory',
            );
          }
          const variantStock = variantStocks[0];
          beforeQuantity = Number(variantStock?.quantity ?? 0);
          afterQuantity = item.actualQuantity;
          difference = afterQuantity - beforeQuantity;

          if (variantStock) {
            await tx.productVariantStock.update({
              where: { id: variantStock.id },
              data: { quantity: afterQuantity, shopId: session.shopId },
            });
          } else {
            await tx.productVariantStock.create({
              data: {
                variantId: item.variantId,
                companyId: context.companyId,
                shopId: session.shopId,
                branchCode,
                quantity: afterQuantity,
              },
            });
          }

          const aggregateAfter = Number(stock?.quantity ?? 0) + difference;
          if (aggregateAfter < 0) {
            throw new ConflictException('Aggregate product stock would become negative');
          }
          if (stock) {
            await tx.productStock.update({
              where: { id: stock.id },
              data: { quantity: aggregateAfter },
            });
          } else {
            await tx.productStock.create({
              data: {
                productId: item.productId,
                shopId: session.shopId,
                branchCode,
                quantity: aggregateAfter,
              },
            });
          }
        } else if (stock) {
          await tx.productStock.update({
            where: { id: stock.id },
            data: { quantity: afterQuantity },
          });
        } else {
          await tx.productStock.create({
            data: {
              productId: item.productId,
              shopId: session.shopId,
              branchCode,
              quantity: afterQuantity,
            },
          });
        }

        if (difference !== 0) {
          await tx.stockMovement.create({
            data: {
              companyId: context.companyId,
              shopId: session.shopId,
              productId: item.productId,
              type: 'ADJUSTMENT',
              displayTypeCode: 'inventory',
              displayTypeLabel: 'Инвентаризация',
              externalId: session.id,
              quantity: new Prisma.Decimal(difference),
              loadedMeasurementValue: new Prisma.Decimal(afterQuantity),
              beforeQuantity: new Prisma.Decimal(beforeQuantity),
              afterQuantity: new Prisma.Decimal(afterQuantity),
              fromShopId: session.shopId,
              toShopId: session.shopId,
              createdById: context.userId,
            },
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
      const completed = await tx.inventorySession.updateMany({
        where: {
          id: sessionId,
          ...this.scope(context),
          status: 'applying',
        },
        data: {
          status: 'completed',
          closedById: context.userId,
          closedAt: new Date(),
        },
      });
      if (completed.count !== 1) {
        throw new ConflictException('Inventory status changed during apply');
      }
    });

    return { success: true, id: sessionId, status: 'completed' };
  }
}
