import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { moveVariantStock, StockLedgerClient } from './stock-ledger';

type SaleStockClient = StockLedgerClient &
  Pick<Prisma.TransactionClient, 'stockMovement'>;

export type SaleStockPostingInput = {
  companyId: string;
  shopId: string;
  branchCode: string;
  productId: number;
  variantId?: string | null;
  quantity: number | Prisma.Decimal;
  createdById: number;
  externalId: string;
  orderId?: string;
  retailPrice: number | Prisma.Decimal;
  lowStockThreshold?: number;
};

export type SaleStockPostingResult = {
  movement: { id: string };
  beforeQuantity: number;
  afterQuantity: number;
  crossedBelowLowStockThreshold: boolean;
};

/**
 * Atomically posts one sale item against its variant stock (the default
 * variant for simple goods); the ledger trigger moves ProductStock with it.
 *
 * The caller owns the surrounding transaction. Missing stock and concurrent
 * depletion are both domain conflicts; a sale must never create negative stock.
 */
export async function postSaleStockDecrease(
  tx: SaleStockClient,
  input: SaleStockPostingInput,
): Promise<SaleStockPostingResult> {
  const quantity = Number(input.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new BadRequestException('Количество товара должно быть больше нуля');
  }

  const move = await moveVariantStock(tx, {
    companyId: input.companyId,
    shopId: input.shopId,
    branchCode: input.branchCode,
    productId: input.productId,
    variantId: input.variantId,
    delta: -quantity,
    insufficientStock: () =>
      new ConflictException(
        `Недостаточно остатка по товару ${input.productId} на складе ${input.branchCode}`,
      ),
  });
  const stock = move.stock;
  const { beforeQuantity, afterQuantity } = move;
  const threshold = input.lowStockThreshold ?? 0;
  const crossedBelowLowStockThreshold =
    threshold > 0 &&
    beforeQuantity >= threshold &&
    afterQuantity < threshold &&
    !stock?.lowStockNotifiedAt;
  const shouldClearLowStockFlag =
    threshold > 0 &&
    afterQuantity >= threshold &&
    Boolean(stock?.lowStockNotifiedAt);

  if (stock && (crossedBelowLowStockThreshold || shouldClearLowStockFlag)) {
    await tx.productStock.update({
      where: { id: stock.id },
      data: {
        lowStockNotifiedAt: crossedBelowLowStockThreshold ? new Date() : null,
      },
    });
  }

  const supplyPrice = stock?.purchasePrice ?? 0;
  const fromRetailPrice = stock?.salePrice ?? 0;
  const movement = await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      shopId: input.shopId,
      productId: input.productId,
      variantId: move.variantId,
      orderId: input.orderId,
      type: 'SALE',
      displayTypeCode: 'sale',
      displayTypeLabel: 'Продажа',
      externalId: input.externalId,
      quantity,
      loadedMeasurementValue: afterQuantity,
      beforeQuantity,
      afterQuantity,
      fromShopId: input.shopId,
      toShopId: input.shopId,
      supplyPrice,
      retailPrice: input.retailPrice,
      newRetailPrice: input.retailPrice,
      fromRetailPrice,
      fromSupplyPrice: supplyPrice,
      createdById: input.createdById,
    },
    select: { id: true },
  });

  return {
    movement,
    beforeQuantity,
    afterQuantity,
    crossedBelowLowStockThreshold,
  };
}
