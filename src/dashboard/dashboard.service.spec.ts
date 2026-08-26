import { DashboardService } from './dashboard.service';

describe('DashboardService', () => {
  const createService = () =>
    new DashboardService({} as any, {} as any, {} as any);

  describe('getItemNetSales', () => {
    it('uses the finalized item price after discount', () => {
      const service = createService();

      expect(
        (service as any).getItemNetSales({
          lineTotal: 395_000,
          retailPriceAtSale: 395_000,
          discountAmount: 39_500,
          finalPrice: 355_500,
        }),
      ).toBe(355_500);
    });

    it('keeps a zero final price for a fully discounted item', () => {
      const service = createService();

      expect(
        (service as any).getItemNetSales({
          lineTotal: 100_000,
          retailPriceAtSale: 100_000,
          discountAmount: 100_000,
          finalPrice: 0,
        }),
      ).toBe(0);
    });

    it('falls back to line total for legacy items without snapshots', () => {
      const service = createService();

      expect(
        (service as any).getItemNetSales({
          lineTotal: 195_000,
          retailPriceAtSale: 0,
          discountAmount: 0,
          finalPrice: 0,
        }),
      ).toBe(195_000);
    });
  });
});
