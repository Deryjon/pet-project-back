import { Prisma } from '@prisma/client';

type MoneyValue = Prisma.Decimal | number | string | null | undefined;

export type SaleAmountSnapshot = {
  payableTotal?: MoneyValue;
  total?: MoneyValue;
  saleType?: string | null;
  discountAmount?: MoneyValue;
  discountPercent?: MoneyValue;
};

export type SaleItemAmountSnapshot = {
  lineTotal?: MoneyValue;
  retailPriceAtSale?: MoneyValue;
  discountAmount?: MoneyValue;
  finalPrice?: MoneyValue;
};

const toNumber = (value: MoneyValue) => Number(value ?? 0);

export function getSignedSaleAmount(sale: SaleAmountSnapshot): number {
  const payableTotal = toNumber(sale.payableTotal);
  const total = toNumber(sale.total);
  const amount =
    payableTotal !== 0 ||
    total === 0 ||
    toNumber(sale.discountAmount) > 0 ||
    toNumber(sale.discountPercent) > 0
      ? payableTotal
      : total;

  return sale.saleType === 'return' ? -amount : amount;
}

export function getSaleItemNetSales(item: SaleItemAmountSnapshot): number {
  const lineTotal = toNumber(item.lineTotal);
  const finalPrice = toNumber(item.finalPrice);
  const hasFinalizedSnapshot =
    toNumber(item.retailPriceAtSale) > 0 ||
    toNumber(item.discountAmount) > 0 ||
    finalPrice > 0;

  // Legacy sale items have zero-filled snapshot columns. A finalized item can
  // legitimately have finalPrice = 0 after a 100% discount, so the other
  // snapshot fields are also used to distinguish that case.
  return hasFinalizedSnapshot ? finalPrice : lineTotal;
}
