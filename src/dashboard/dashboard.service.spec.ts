import {
  getSaleItemNetSales,
  getSignedSaleAmount,
} from '../common/money-calculations';

describe('money calculations', () => {
  describe('getSaleItemNetSales', () => {
    it('uses the finalized item price after discount', () => {
      expect(
        getSaleItemNetSales({
          lineTotal: 395_000,
          retailPriceAtSale: 395_000,
          discountAmount: 39_500,
          finalPrice: 355_500,
        }),
      ).toBe(355_500);
    });

    it('keeps a zero final price for a fully discounted item', () => {
      expect(
        getSaleItemNetSales({
          lineTotal: 100_000,
          retailPriceAtSale: 100_000,
          discountAmount: 100_000,
          finalPrice: 0,
        }),
      ).toBe(0);
    });

    it('falls back to line total for legacy items without snapshots', () => {
      expect(
        getSaleItemNetSales({
          lineTotal: 195_000,
          retailPriceAtSale: 0,
          discountAmount: 0,
          finalPrice: 0,
        }),
      ).toBe(195_000);
    });
  });

  describe('getSignedSaleAmount', () => {
    it('uses payable total when a sale has a discount', () => {
      expect(
        getSignedSaleAmount({
          total: 395_000,
          payableTotal: 355_500,
          discountAmount: 39_500,
          saleType: 'sale',
        }),
      ).toBe(355_500);
    });

    it('falls back to legacy total when payable total is missing', () => {
      expect(
        getSignedSaleAmount({
          total: 195_000,
          payableTotal: 0,
          saleType: 'sale',
        }),
      ).toBe(195_000);
    });

    it('makes returns negative', () => {
      expect(
        getSignedSaleAmount({
          total: 100_000,
          payableTotal: 90_000,
          discountAmount: 10_000,
          saleType: 'return',
        }),
      ).toBe(-90_000);
    });
  });
});
