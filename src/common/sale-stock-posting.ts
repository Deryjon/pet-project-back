import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

type SaleStockClient = Pick<
  Prisma.TransactionClient,
  'productStock' | 'stockMovement'
>;

export type SaleStockPostingInput = {
  companyId: string;
  shopId: string;
  branchCode: string;
  productId: number;
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
 * Atomically posts one sale item against a stock row.
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

  const stock = await tx.productStock.findFirst({
    where: {
      productId: input.productId,
      shopId: input.shopId,
      branchCode: input.branchCode,
      product: {
        companyId: input.companyId,
      },
    },
  });

  const insufficientStock = () =>
    new ConflictException(
      `Недостаточно остатка по товару ${input.productId} на складе ${input.branchCode}`,
    );

  if (!stock || stock.quantity < quantity) {
    throw insufficientStock();
  }

  const beforeQuantity = stock.quantity;
  const afterQuantity = beforeQuantity - quantity;
  const threshold = input.lowStockThreshold ?? 0;
  const crossedBelowLowStockThreshold =
    threshold > 0 &&
    beforeQuantity >= threshold &&
    afterQuantity < threshold &&
    !stock.lowStockNotifiedAt;
  const shouldClearLowStockFlag =
    threshold > 0 &&
    afterQuantity >= threshold &&
    Boolean(stock.lowStockNotifiedAt);

  const decremented = await tx.productStock.updateMany({
    where: {
      id: stock.id,
      quantity: { gte: quantity },
    },
    data: {
      quantity: { decrement: quantity },
      ...(crossedBelowLowStockThreshold
        ? { lowStockNotifiedAt: new Date() }
        : {}),
      ...(shouldClearLowStockFlag ? { lowStockNotifiedAt: null } : {}),
    },
  });

  if (decremented.count !== 1) {
    throw insufficientStock();
  }

  const supplyPrice = stock.purchasePrice ?? 0;
  const fromRetailPrice = stock.salePrice ?? 0;
  const movement = await tx.stockMovement.create({
    data: {
      companyId: input.companyId,
      shopId: input.shopId,
      productId: input.productId,
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
