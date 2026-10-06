import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ProductVariantStock is the only stock ledger. A DB trigger keeps
// ProductStock.quantity (per product and shop) and Product.quantity equal to
// the sum of the variant stocks, and rejects direct writes of
// ProductStock.quantity. Simple goods keep their stock on the default variant.

export type StockLedgerClient = Pick<
  Prisma.TransactionClient,
  'product' | 'productVariant' | 'productVariantStock' | 'productStock'
>;

export type ShopStockRow = {
  id: number;
  quantity: number;
  purchasePrice: number | null;
  salePrice: number | null;
  lowStockNotifiedAt: Date | null;
};

type StockTarget = {
  companyId: string;
  shopId: string;
  branchCode: string;
  productId: number;
  variantId?: string | null;
  // Prices for rows created by this change (otherwise the shop prices).
  prices?: { purchasePrice?: number | null; salePrice?: number | null };
};

export type StockMoveInput = StockTarget & {
  // Positive adds stock, negative takes it; a take never goes below zero.
  delta: number;
  insufficientStock?: () => Error;
};

export type StockMoveResult = {
  variantId: string;
  delta: number;
  // Product-level quantity in the shop, as stock movements report it.
  beforeQuantity: number;
  afterQuantity: number;
  stock: ShopStockRow | null;
};

// The variant whose stock a product-level operation moves: the given one
// (checked against product and company) or the product's default variant,
// created on demand for products that never had one.
export async function resolveLedgerVariantId(
  tx: StockLedgerClient,
  companyId: string,
  productId: number,
  variantId?: string | null,
) {
  if (variantId) {
    const variant = await tx.productVariant.findFirst({
      where: { id: variantId, productId, companyId },
      select: { id: true },
    });
    if (!variant) {
      throw new NotFoundException(`Product variant ${variantId} not found`);
    }
    return variant.id;
  }

  const existing = await tx.productVariant.findFirst({
    where: { productId, companyId, isDefault: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }

  const product = await tx.product.findFirst({
    where: { id: productId, companyId },
    select: {
      sku: true,
      barcode: true,
      purchasePrice: true,
      salePrice: true,
      archivedAt: true,
    },
  });
  if (!product) {
    throw new NotFoundException(`Product ${productId} not found`);
  }
  const identifiers = [
    ...(product.barcode ? [{ barcode: product.barcode }] : []),
    ...(product.sku ? [{ sku: product.sku }] : []),
  ];
  const clash = identifiers.length
    ? await tx.productVariant.findFirst({
        where: { companyId, OR: identifiers },
        select: { id: true },
      })
    : null;
  const created = await tx.productVariant.create({
    data: {
      companyId,
      productId,
      isDefault: true,
      isActive: !product.archivedAt,
      barcode: clash ? null : product.barcode,
      sku: clash ? null : product.sku,
      purchasePrice: product.purchasePrice,
      salePrice: product.salePrice,
      attributeValues: {},
    },
    select: { id: true },
  });
  return created.id;
}

async function shopStockAfter(
  tx: StockLedgerClient,
  target: StockTarget,
  variantId: string,
  delta: number,
): Promise<StockMoveResult> {
  let stock: ShopStockRow | null = await tx.productStock.findUnique({
    where: {
      productId_shopId: { productId: target.productId, shopId: target.shopId },
    },
  });
  // A shop row created by the ledger trigger has no prices yet.
  if (
    stock &&
    target.prices &&
    stock.purchasePrice === null &&
    stock.salePrice === null
  ) {
    stock = await tx.productStock.update({
      where: { id: stock.id },
      data: {
        purchasePrice: target.prices.purchasePrice ?? null,
        salePrice: target.prices.salePrice ?? null,
      },
    });
  }
  const afterQuantity = stock?.quantity ?? 0;
  return {
    variantId,
    delta,
    beforeQuantity: afterQuantity - delta,
    afterQuantity,
    stock,
  };
}

async function createVariantStockRow(
  tx: StockLedgerClient,
  target: StockTarget,
  variantId: string,
  quantity: number,
) {
  const shopStock = await tx.productStock.findUnique({
    where: {
      productId_shopId: { productId: target.productId, shopId: target.shopId },
    },
    select: { purchasePrice: true, salePrice: true },
  });
  return {
    companyId: target.companyId,
    variantId,
    shopId: target.shopId,
    branchCode: target.branchCode,
    quantity,
    purchasePrice:
      target.prices?.purchasePrice ?? shopStock?.purchasePrice ?? null,
    salePrice: target.prices?.salePrice ?? shopStock?.salePrice ?? null,
  };
}

export async function moveVariantStock(
  tx: StockLedgerClient,
  input: StockMoveInput,
): Promise<StockMoveResult> {
  const delta = Number(input.delta);
  if (!Number.isFinite(delta)) {
    throw new BadRequestException('Некорректное количество товара');
  }
  const variantId = await resolveLedgerVariantId(
    tx,
    input.companyId,
    input.productId,
    input.variantId,
  );

  if (delta < 0) {
    const claimed = await tx.productVariantStock.updateMany({
      where: { variantId, shopId: input.shopId, quantity: { gte: -delta } },
      data: { quantity: { decrement: -delta } },
    });
    if (claimed.count !== 1) {
      throw (
        input.insufficientStock?.() ??
        new ConflictException(
          `Недостаточно остатка по товару ${input.productId} на складе ${input.branchCode}`,
        )
      );
    }
  } else if (delta > 0) {
    await tx.productVariantStock.upsert({
      where: { variantId_shopId: { variantId, shopId: input.shopId } },
      create: await createVariantStockRow(tx, input, variantId, delta),
      update: { quantity: { increment: delta } },
    });
  }

  return shopStockAfter(tx, input, variantId, delta);
}

// Sets a variant's stock in a shop to an absolute value (stock edits in the
// product form, imports, inventory). Compare-and-set: a concurrent change
// between reading and writing is reported instead of overwritten.
export async function setVariantStock(
  tx: StockLedgerClient,
  input: StockTarget & { quantity: number },
): Promise<StockMoveResult> {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity < 0) {
    throw new BadRequestException('Остаток не может быть отрицательным');
  }
  const variantId = await resolveLedgerVariantId(
    tx,
    input.companyId,
    input.productId,
    input.variantId,
  );
  const current = await tx.productVariantStock.findUnique({
    where: { variantId_shopId: { variantId, shopId: input.shopId } },
    select: { id: true, quantity: true },
  });

  if (!current) {
    if (quantity > 0) {
      await tx.productVariantStock.create({
        data: await createVariantStockRow(tx, input, variantId, quantity),
      });
    }
    return shopStockAfter(tx, input, variantId, quantity);
  }

  if (current.quantity !== quantity) {
    const updated = await tx.productVariantStock.updateMany({
      where: { id: current.id, quantity: current.quantity },
      data: { quantity },
    });
    if (updated.count !== 1) {
      throw new ConflictException(
        'Остаток товара изменился во время сохранения, повторите действие',
      );
    }
  }
  return shopStockAfter(tx, input, variantId, quantity - current.quantity);
}
