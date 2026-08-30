import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { UsersService } from '../../users/users.service';
import { ImportMatcherService } from './import-matcher.service';
import { ImportNormalizerService } from './import-normalizer.service';
import { InvoiceRecognitionService } from './invoice-recognition.service';

@Injectable()
export class SupplierInvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly users: UsersService,
    private readonly matcher: ImportMatcherService,
    private readonly normalizer: ImportNormalizerService,
    private readonly recognition: InvoiceRecognitionService,
  ) {}
  private async context(auth?: string) {
    const ctx = await this.users.getRequestContext(auth);
    if (!ctx.companyId)
      throw new ForbiddenException('Company context required');
    return { ...ctx, companyId: ctx.companyId };
  }

  async saveFiles(
    id: string,
    files: Array<{
      originalname: string;
      mimetype: string;
      size: number;
      path: string;
      filename: string;
    }>,
    auth?: string,
  ) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    if (!['DRAFT', 'PROCESSING', 'REVIEW', 'READY'].includes(invoice.status))
      throw new BadRequestException('Invoice files can no longer be changed');
    if (!files.length) throw new BadRequestException('files are required');
    const stored = files.map((file) => ({
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      path: file.path,
      url: `/uploads/invoices/${file.filename}`,
    }));
    return this.prisma.$transaction(async (tx: any) => {
      await tx.supplierInvoice.update({
        where: { id },
        data: { originalFiles: stored, status: 'PROCESSING' },
      });
      await this.audit(tx, ctx, 'FILE_UPLOADED', id, {
        files: stored.map(({ path: _path, ...file }) => file),
      });
      return { files: stored.map(({ path: _path, ...file }) => file) };
    });
  }

  async recognize(id: string, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    const files = Array.isArray(invoice.originalFiles)
      ? (invoice.originalFiles as any[])
      : [];
    const result = await this.recognition.recognize(files);
    await (this.prisma as any).supplierInvoiceItem.deleteMany({
      where: { invoiceId: id },
    });
    const updated = await this.addItems(id, { items: result.items }, auth);
    await (this.prisma as any).supplierInvoice.update({
      where: { id },
      data: {
        invoiceNumber: result.invoiceNumber || invoice.invoiceNumber,
        invoiceDate: result.invoiceDate
          ? new Date(result.invoiceDate)
          : invoice.invoiceDate,
      },
    });
    await this.audit(this.prisma, ctx, 'OCR_COMPLETED', id, {
      itemCount: result.items.length,
    });
    return updated;
  }
  private include() {
    return {
      supplier: true,
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      items: {
        include: {
          matchedProduct: true,
          allocations: { include: { shop: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
    };
  }
  private num(value: unknown, field: string, allowZero = false) {
    const result = Number(value);
    if (!Number.isFinite(result) || (allowZero ? result < 0 : result <= 0))
      throw new BadRequestException(`${field} is invalid`);
    return result;
  }
  private assertEditable(invoice: { status: string }) {
    if (!['DRAFT', 'PROCESSING', 'REVIEW', 'READY'].includes(invoice.status))
      throw new ConflictException('Invoice can no longer be changed');
  }
  private async syncProductQuantity(
    tx: any,
    productId: number,
    strategy?: string,
    lastPurchasePrice?: number,
  ) {
    const stocks = await tx.productStock.findMany({
      where: { productId },
      select: { quantity: true, purchasePrice: true },
    });
    const quantity = stocks.reduce(
      (sum: number, stock: any) => sum + Number(stock.quantity),
      0,
    );
    const data: any = { quantity };
    if (strategy === 'LAST_PURCHASE' && lastPurchasePrice !== undefined)
      data.purchasePrice = lastPurchasePrice;
    if (strategy === 'WEIGHTED_AVERAGE' && quantity > 0)
      data.purchasePrice =
        stocks.reduce(
          (sum: number, stock: any) =>
            sum + Number(stock.quantity) * Number(stock.purchasePrice ?? 0),
          0,
        ) / quantity;
    await tx.product.update({ where: { id: productId }, data });
  }
  private async audit(
    tx: any,
    ctx: any,
    action: string,
    id: string,
    meta?: any,
  ) {
    await tx.auditLog.create({
      data: {
        companyId: ctx.companyId,
        userId: ctx.userId,
        action,
        entity: 'SupplierInvoice',
        entityId: id,
        meta: meta ?? undefined,
      },
    });
  }

  async create(body: any, auth?: string) {
    const ctx = await this.context(auth);
    const supplierId = this.num(body.supplierId, 'supplierId');
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, companyId: ctx.companyId, isActive: true },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const duplicate = body.invoiceNumber
      ? await (this.prisma as any).supplierInvoice.findFirst({
          where: {
            companyId: ctx.companyId,
            supplierId,
            invoiceNumber: String(body.invoiceNumber),
            status: { notIn: ['CANCELLED', 'ROLLED_BACK'] },
          },
          select: { id: true, status: true },
        })
      : null;
    return this.prisma.$transaction(async (tx: any) => {
      const invoice = await tx.supplierInvoice.create({
        data: {
          companyId: ctx.companyId,
          supplierId,
          createdById: ctx.userId,
          invoiceNumber: body.invoiceNumber || null,
          invoiceDate: body.invoiceDate ? new Date(body.invoiceDate) : null,
          idempotencyKey: body.idempotencyKey || null,
        },
        include: this.include(),
      });
      await this.audit(tx, ctx, 'INVOICE_CREATED', invoice.id, { duplicate });
      return { invoice, duplicateWarning: duplicate };
    });
  }
  async list(query: any, auth?: string) {
    const ctx = await this.context(auth);
    const page = Math.max(1, Number(query.page) || 1),
      limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const where: any = {
      companyId: ctx.companyId,
      ...(query.status ? { status: query.status } : {}),
      ...(query.supplierId ? { supplierId: Number(query.supplierId) } : {}),
    };
    const [data, total] = await Promise.all([
      (this.prisma as any).supplierInvoice.findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      (this.prisma as any).supplierInvoice.count({ where }),
    ]);
    return { data, meta: { page, limit, total } };
  }
  async get(id: string, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await (this.prisma as any).supplierInvoice.findFirst({
      where: { id, companyId: ctx.companyId },
      include: this.include(),
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }
  async addItems(id: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const rows = Array.isArray(body.items) ? body.items : [];
    if (!rows.length) throw new BadRequestException('items are required');
    return this.prisma.$transaction(async (tx: any) => {
      for (const row of rows) {
        const quantity = this.num(row.quantity, 'quantity'),
          supplyPrice = this.num(row.supplyPrice, 'supplyPrice', true);
        const warnings: string[] = [];
        if (!String(row.rawName || '').trim())
          throw new BadRequestException('rawName is required');
        if (
          row.totalPrice != null &&
          Math.abs(quantity * supplyPrice - Number(row.totalPrice)) >
            Math.max(1, quantity * supplyPrice * 0.01)
        )
          warnings.push('TOTAL_MISMATCH');
        await tx.supplierInvoiceItem.create({
          data: {
            invoiceId: id,
            rawName: String(row.rawName).trim(),
            rawSku: row.sku || null,
            rawBarcode: row.barcode || null,
            originalQuantity: quantity,
            originalSupplyPrice: supplyPrice,
            quantity,
            supplyPrice,
            totalPrice: row.totalPrice ?? quantity * supplyPrice,
            warnings,
          },
        });
      }
      await tx.supplierInvoice.update({
        where: { id },
        data: { status: 'REVIEW' },
      });
      await this.audit(tx, ctx, 'OCR_COMPLETED', id, {
        itemCount: rows.length,
      });
      return tx.supplierInvoice.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }
  async updateItem(id: string, itemId: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const existing = await (this.prisma as any).supplierInvoiceItem.findFirst({
      where: { id: itemId, invoiceId: id },
    });
    if (!existing) throw new NotFoundException('Invoice item not found');
    const data: any = {};
    if (body.rawName !== undefined)
      data.correctedName = String(body.rawName).trim();
    if (body.sku !== undefined) data.correctedSku = body.sku || null;
    if (body.barcode !== undefined)
      data.correctedBarcode = body.barcode || null;
    if (body.quantity !== undefined)
      data.quantity = this.num(body.quantity, 'quantity');
    if (body.supplyPrice !== undefined)
      data.supplyPrice = this.num(body.supplyPrice, 'supplyPrice', true);
    return this.prisma.$transaction(async (tx: any) => {
      const item = await tx.supplierInvoiceItem.update({
        where: { id: itemId },
        data,
      });
      await this.audit(tx, ctx, 'ITEM_EDITED', id, {
        itemId,
        oldValue: existing,
        newValue: data,
      });
      return item;
    });
  }
  async deleteItem(id: string, itemId: string, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const item = invoice.items.find((entry: any) => entry.id === itemId);
    if (!item) throw new NotFoundException('Invoice item not found');

    return this.prisma.$transaction(async (tx: any) => {
      const deleted = await tx.supplierInvoiceItem.deleteMany({
        where: { id: itemId, invoiceId: id },
      });
      if (!deleted.count) throw new NotFoundException('Invoice item not found');

      await this.audit(tx, ctx, 'ITEM_DELETED', id, {
        itemId,
        rawName: item.rawName,
        quantity: Number(item.quantity),
        supplyPrice: Number(item.supplyPrice),
      });

      return tx.supplierInvoice.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }
  async autoMatch(id: string, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const results: any[] = [];
    for (const item of invoice.items) {
      const found = await this.matcher.match(
        ctx.companyId,
        invoice.supplierId,
        item,
      );
      const updated = await (this.prisma as any).supplierInvoiceItem.update({
        where: { id: item.id },
        data: {
          // Automatic matching is a suggestion only. A product is linked only
          // after the user explicitly confirms it in matchItem().
          matchedProductId: null,
          matchMethod: found?.method ?? null,
          matchConfidence: found?.confidence ?? null,
          status: found ? 'NEEDS_REVIEW' : 'NEW_PRODUCT',
          userConfirmed: false,
        },
      });
      results.push({
        invoiceItemId: item.id,
        rawName: item.rawName,
        product: found?.product ?? null,
        matchMethod: found?.method ?? null,
        confidence: found?.confidence ?? null,
        conflict: found?.conflict ?? false,
        status: updated.status,
      });
    }
    const summary = {
      total: results.length,
      matched: results.filter((x) => x.status === 'MATCHED').length,
      needsReview: results.filter((x) => x.status === 'NEEDS_REVIEW').length,
      newProducts: results.filter((x) => x.status === 'NEW_PRODUCT').length,
    };
    return { summary, items: results };
  }
  async matchItem(id: string, itemId: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const item = invoice.items.find((entry: any) => entry.id === itemId);
    if (!item) throw new NotFoundException('Invoice item not found');
    const productId = this.num(body.productId, 'productId');
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: ctx.companyId },
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.$transaction(async (tx: any) => {
      const updated = await tx.supplierInvoiceItem.update({
        where: { id: itemId },
        data: {
          matchedProductId: productId,
          matchMethod: 'USER_CONFIRMED',
          matchConfidence: 100,
          status: 'MATCHED',
          userConfirmed: true,
        },
      });
      const name = item.correctedName || item.rawName;
      await tx.supplierProductAlias
        .upsert({
          where: {
            companyId_supplierId_supplierSku: {
              companyId: ctx.companyId,
              supplierId: invoice.supplierId,
              supplierSku: item.correctedSku || item.rawSku,
            },
          },
          create: {
            companyId: ctx.companyId,
            supplierId: invoice.supplierId,
            productId,
            supplierName: name,
            normalizedName: this.normalizer.normalize(name),
            supplierSku: item.correctedSku || item.rawSku || null,
            supplierBarcode: item.correctedBarcode || item.rawBarcode || null,
            lastSupplyPrice: item.supplyPrice,
            lastSeenAt: new Date(),
          },
          update: {
            productId,
            supplierName: name,
            normalizedName: this.normalizer.normalize(name),
            lastSupplyPrice: item.supplyPrice,
            lastSeenAt: new Date(),
          },
        })
        .catch(async () =>
          tx.supplierProductAlias.create({
            data: {
              companyId: ctx.companyId,
              supplierId: invoice.supplierId,
              productId,
              supplierName: name,
              normalizedName: this.normalizer.normalize(name),
              supplierBarcode: item.correctedBarcode || item.rawBarcode || null,
              lastSupplyPrice: item.supplyPrice,
              lastSeenAt: new Date(),
            },
          }),
        );
      await this.audit(tx, ctx, 'PRODUCT_MATCHED', id, { itemId, productId });
      return updated;
    });
  }

  async mergeItems(id: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    if (!['REVIEW', 'DRAFT', 'READY'].includes(invoice.status)) {
      throw new BadRequestException('Items can only be merged during review');
    }
    const itemIds = [
      ...new Set(Array.isArray(body.itemIds) ? body.itemIds.map(String) : []),
    ];
    if (itemIds.length < 2)
      throw new BadRequestException('Select at least two items');
    const items = invoice.items.filter((item: any) =>
      itemIds.includes(item.id),
    );
    if (items.length !== itemIds.length)
      throw new BadRequestException('Some items do not belong to invoice');
    const productId = items[0].matchedProductId;
    if (
      !productId ||
      items.some((item: any) => item.matchedProductId !== productId)
    ) {
      throw new BadRequestException(
        'Only rows matched to the same product can be merged',
      );
    }
    if (items.some((item: any) => item.allocations.length)) {
      throw new BadRequestException('Remove allocations before merging items');
    }
    const [target, ...duplicates] = items;
    const quantity = items.reduce(
      (sum: number, item: any) => sum + Number(item.quantity),
      0,
    );
    const totalPrice = items.reduce(
      (sum: number, item: any) =>
        sum + Number(item.quantity) * Number(item.supplyPrice),
      0,
    );
    const supplyPrice = Number((totalPrice / quantity).toFixed(2));
    const roundedTotalPrice = Number(totalPrice.toFixed(2));
    return this.prisma.$transaction(async (tx: any) => {
      await tx.supplierInvoiceItem.update({
        where: { id: target.id },
        data: {
          quantity,
          supplyPrice,
          totalPrice: roundedTotalPrice,
          userConfirmed: true,
          status: 'MATCHED',
        },
      });
      await tx.supplierInvoiceItem.deleteMany({
        where: {
          id: { in: duplicates.map((item: any) => item.id) },
          invoiceId: id,
        },
      });
      await this.audit(tx, ctx, 'ITEMS_MERGED', id, {
        keptItemId: target.id,
        removedItemIds: duplicates.map((item: any) => item.id),
        productId,
        quantity,
        supplyPrice,
        totalPrice: roundedTotalPrice,
      });
      return tx.supplierInvoice.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }
  async allocate(id: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    const allocations = Array.isArray(body.allocations) ? body.allocations : [];
    if (!allocations.length)
      throw new BadRequestException('allocations are required');
    const allowed = new Set(ctx.allowedShopIds);
    const seen = new Set<string>();
    const normalized = allocations.map((entry: any) => {
      const item = invoice.items.find(
        (candidate: any) => candidate.id === entry.invoiceItemId,
      );
      if (!item)
        throw new BadRequestException(
          'Allocation item does not belong to invoice',
        );
      if (!allowed.has(entry.shopId))
        throw new ForbiddenException('Shop is not available');
      const key = `${item.id}:${entry.shopId}`;
      if (seen.has(key)) throw new BadRequestException('Duplicate allocation');
      seen.add(key);
      return {
        invoiceItemId: item.id,
        shopId: entry.shopId,
        quantity: this.num(entry.quantity, 'allocation quantity'),
      };
    });
    return this.prisma.$transaction(async (tx: any) => {
      await tx.invoiceAllocation.deleteMany({
        where: {
          invoiceItemId: { in: invoice.items.map((item: any) => item.id) },
        },
      });
      await tx.invoiceAllocation.createMany({ data: normalized });
      await this.audit(tx, ctx, 'ALLOCATION_CHANGED', id);
      return tx.supplierInvoice.findUnique({
        where: { id },
        include: this.include(),
      });
    });
  }
  async markReady(id: string, auth?: string) {
    const invoice = await this.get(id, auth);
    this.assertEditable(invoice);
    if (!invoice.items.length)
      throw new BadRequestException('Invoice has no items');
    for (const item of invoice.items) {
      if (!item.matchedProductId || item.status !== 'MATCHED')
        throw new BadRequestException('Every item must be matched');
      const distributed = item.allocations.reduce(
        (sum: number, x: any) => sum + Number(x.quantity),
        0,
      );
      if (Math.abs(distributed - Number(item.quantity)) > 0.0001)
        throw new BadRequestException(`Item ${item.id} is not fully allocated`);
    }
    return (this.prisma as any).supplierInvoice.update({
      where: { id },
      data: { status: 'READY' },
    });
  }
  async commit(id: string, body: any, auth?: string) {
    const ctx = await this.context(auth);
    return this.prisma.$transaction(
      async (tx: any) => {
        const invoice = await tx.supplierInvoice.findFirst({
          where: { id, companyId: ctx.companyId },
          include: this.include(),
        });
        if (!invoice) throw new NotFoundException('Invoice not found');
        if (invoice.status === 'COMMITTED')
          throw new ConflictException('Invoice already committed');
        if (invoice.status !== 'READY')
          throw new BadRequestException('Invoice is not ready');
        const company = await tx.company.findUnique({
          where: { id: ctx.companyId },
          select: { supplyPriceStrategy: true },
        });
        const strategy =
          body.supplyPriceStrategy ||
          company?.supplyPriceStrategy ||
          'LAST_PURCHASE';
        if (!['LAST_PURCHASE', 'WEIGHTED_AVERAGE', 'MANUAL'].includes(strategy))
          throw new BadRequestException('Invalid supply price strategy');
        const affectedProductIds = new Set<number>();
        const lastPurchasePrices = new Map<number, number>();
        for (const item of invoice.items) {
          const total = item.allocations.reduce(
            (sum: number, x: any) => sum + Number(x.quantity),
            0,
          );
          if (
            !item.matchedProductId ||
            Math.abs(total - Number(item.quantity)) > 0.0001
          )
            throw new BadRequestException('Invalid item allocation');
          const product = await tx.product.findFirst({
            where: { id: item.matchedProductId, companyId: ctx.companyId },
          });
          if (!product)
            throw new NotFoundException('Matched product not found');
          affectedProductIds.add(product.id);
          lastPurchasePrices.set(product.id, Number(item.supplyPrice));
          for (const allocation of item.allocations) {
            const stock = await tx.productStock.findFirst({
              where: {
                productId: item.matchedProductId,
                branchCode: allocation.shop.branchCode,
              },
            });
            const before = Number(stock?.quantity ?? 0),
              incoming = Number(allocation.quantity),
              price = Number(item.supplyPrice);
            const nextPrice =
              strategy === 'WEIGHTED_AVERAGE' && before + incoming > 0
                ? (before *
                    Number(stock?.purchasePrice ?? product.purchasePrice ?? 0) +
                    incoming * price) /
                  (before + incoming)
                : strategy === 'MANUAL'
                  ? Number(
                      stock?.purchasePrice ?? product.purchasePrice ?? price,
                    )
                  : price;
            if (stock)
              await tx.productStock.update({
                where: { id: stock.id },
                data: {
                  quantity: { increment: incoming },
                  purchasePrice: nextPrice,
                },
              });
            else
              await tx.productStock.create({
                data: {
                  productId: product.id,
                  branchCode: allocation.shop.branchCode,
                  quantity: incoming,
                  purchasePrice: nextPrice,
                  salePrice: product.salePrice,
                },
              });
            await tx.stockMovement.create({
              data: {
                companyId: ctx.companyId,
                shopId: allocation.shopId,
                productId: product.id,
                type: 'PURCHASE',
                displayTypeCode: 'supplier_invoice',
                displayTypeLabel: 'Приход от поставщика',
                externalId: invoice.id,
                quantity: incoming,
                beforeQuantity: before,
                afterQuantity: before + incoming,
                fromShopId: allocation.shopId,
                toShopId: allocation.shopId,
                supplyPrice: price,
                fromSupplyPrice: Number(
                  stock?.purchasePrice ?? product.purchasePrice ?? 0,
                ),
                retailPrice: Number(product.salePrice ?? 0),
                createdById: ctx.userId,
              },
            });
            await tx.productSupplyPriceHistory.create({
              data: {
                productId: product.id,
                shopId: allocation.shopId,
                supplyPrice: nextPrice,
                oldSupplyPrice: Number(
                  stock?.purchasePrice ?? product.purchasePrice ?? 0,
                ),
                createdById: ctx.userId,
              },
            });
          }
        }
        for (const productId of affectedProductIds)
          await this.syncProductQuantity(
            tx,
            productId,
            strategy,
            lastPurchasePrices.get(productId),
          );
        await tx.supplierInvoice.update({
          where: { id },
          data: {
            status: 'COMMITTED',
            committedAt: new Date(),
            totalQuantity: invoice.items.reduce(
              (s: number, x: any) => s + Number(x.quantity),
              0,
            ),
            totalAmount: invoice.items.reduce(
              (s: number, x: any) =>
                s + Number(x.quantity) * Number(x.supplyPrice),
              0,
            ),
          },
        });
        await this.audit(tx, ctx, 'INVOICE_COMMITTED', id);
        return { id, status: 'COMMITTED' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
  async cancel(id: string, auth?: string) {
    await this.get(id, auth);
    const result = await (this.prisma as any).supplierInvoice.updateMany({
      where: { id, status: { in: ['DRAFT', 'PROCESSING', 'REVIEW', 'READY'] } },
      data: { status: 'CANCELLED' },
    });
    if (!result.count)
      throw new ConflictException('Invoice cannot be cancelled');
    return { id, status: 'CANCELLED' };
  }
  async rollback(id: string, auth?: string) {
    const ctx = await this.context(auth);
    return this.prisma.$transaction(
      async (tx: any) => {
        const invoice = await tx.supplierInvoice.findFirst({
          where: { id, companyId: ctx.companyId, status: 'COMMITTED' },
          include: this.include(),
        });
        if (!invoice)
          throw new ConflictException(
            'Only committed invoice can be rolled back',
          );
        const movements = await tx.stockMovement.findMany({
          where: { companyId: ctx.companyId, externalId: id, type: 'PURCHASE' },
          orderBy: { createdAt: 'desc' },
        });
        if (!movements.length)
          throw new ConflictException('Invoice stock movements not found');
        const grouped = new Map<string, any>();
        for (const movement of movements) {
          const key = `${movement.productId}:${movement.shopId}`;
          const current = grouped.get(key);
          if (current) current.quantity += Number(movement.quantity);
          else
            grouped.set(key, {
              ...movement,
              quantity: Number(movement.quantity),
            });
        }
        const prepared: any[] = [];
        for (const movement of grouped.values()) {
          const shop = await tx.shop.findUnique({
            where: { id: movement.shopId },
          });
          if (!shop) throw new NotFoundException('Movement shop not found');
          const stock = await tx.productStock.findFirst({
            where: {
              productId: movement.productId,
              branchCode: shop.branchCode,
            },
          });
          const quantity = Number(movement.quantity);
          if (!stock || Number(stock.quantity) + 0.0001 < quantity)
            throw new BadRequestException('Rollback would make stock negative');
          prepared.push({ movement, stock, quantity });
        }
        const affectedProductIds = new Set<number>();
        for (const { movement, stock, quantity } of prepared) {
          const before = Number(stock.quantity);
          await tx.productStock.update({
            where: { id: stock.id },
            data: { quantity: { decrement: quantity } },
          });
          await tx.stockMovement.create({
            data: {
              companyId: ctx.companyId,
              shopId: movement.shopId,
              productId: movement.productId,
              type: 'ADJUSTMENT',
              displayTypeCode: 'supplier_invoice_rollback',
              displayTypeLabel: 'Отмена прихода',
              externalId: id,
              quantity: -quantity,
              beforeQuantity: before,
              afterQuantity: before - quantity,
              fromShopId: movement.shopId,
              toShopId: movement.shopId,
              supplyPrice: movement.supplyPrice,
              retailPrice: movement.retailPrice,
              createdById: ctx.userId,
            },
          });
          affectedProductIds.add(movement.productId);
        }
        for (const productId of affectedProductIds)
          await this.syncProductQuantity(tx, productId);
        await tx.supplierInvoice.update({
          where: { id },
          data: { status: 'ROLLED_BACK', rolledBackAt: new Date() },
        });
        await this.audit(tx, ctx, 'INVOICE_ROLLED_BACK', id);
        return { id, status: 'ROLLED_BACK' };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }
}
