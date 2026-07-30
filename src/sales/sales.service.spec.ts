import { ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SalesService } from './sales.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramService } from '../telegram/telegram.service';
import { UsersService } from '../users/users.service';

/**
 * Characterization tests for the sale total/discount/rounding math, written
 * BEFORE the Sale/SaleItem Float -> Decimal migration so it can be run
 * before and after to confirm the migration didn't silently change results.
 */
describe('SalesService money calculations', () => {
  function createService(prismaOverrides: Record<string, any> = {}) {
    const prisma = {
      sale: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      saleItem: {
        update: jest.fn(),
      },
      productStock: {
        findFirst: jest.fn(),
      },
      product: {
        findUnique: jest.fn(),
      },
      sellerSalarySettings: {
        findUnique: jest.fn(),
      },
      ...prismaOverrides,
    } as unknown as PrismaService;

    const companySettingsService = {} as CompanySettingsService;
    const usersService = {} as UsersService;
    const telegramService = {} as TelegramService;

    const service = new SalesService(
      prisma,
      companySettingsService,
      usersService,
      telegramService,
    );

    return { service, prisma };
  }

  describe('recalculateSale', () => {
    it('sums line totals and applies a flat discount', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        discountPercent: 0,
        discountAmount: 500,
        items: [{ lineTotal: 1000 }, { lineTotal: 2000 }],
      });

      await (service as any).recalculateSale(1);

      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { total: 3000, payableTotal: 2500 },
      });
    });

    it('sums line totals and applies a percent discount', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 2,
        discountPercent: 10,
        discountAmount: 0,
        items: [{ lineTotal: 1000 }, { lineTotal: 500 }, { lineTotal: 250 }],
      });

      await (service as any).recalculateSale(2);

      // total = 1750, 10% discount = 175 -> payableTotal = 1575
      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 2 },
        data: { total: 1750, payableTotal: 1575 },
      });
    });

    it('combines percent and flat discount and never goes below zero', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 3,
        discountPercent: 50,
        discountAmount: 900,
        items: [{ lineTotal: 1000 }],
      });

      await (service as any).recalculateSale(3);

      // total = 1000, 50% = 500, flat = 900 -> 1000 - 500 - 900 = -400 -> clamped to 0
      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { total: 1000, payableTotal: 0 },
      });
    });

    it('handles a sale with no items', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 4,
        discountPercent: 0,
        discountAmount: 0,
        items: [],
      });

      await (service as any).recalculateSale(4);

      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { total: 0, payableTotal: 0 },
      });
    });
  });

  describe('finalizeSaleItemSnapshots', () => {
    it('prorates a flat discount across multiple items by their share of the retail total, and rounds to 2dp', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        branchCode: 'B1',
        discountAmount: 100,
        discountPercent: 0,
        items: [
          {
            id: 101,
            productId: 1,
            quantity: 3,
            salePrice: 100,
            lineTotal: 300,
            sellerId: null,
          },
          {
            id: 102,
            productId: 2,
            quantity: 1,
            salePrice: 700,
            lineTotal: 700,
            sellerId: null,
          },
        ],
      });
      (prisma.productStock.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.product.findUnique as jest.Mock).mockImplementation(
        ({ where }: any) => {
          const purchasePrice = where.id === 1 ? 50 : 400;
          return Promise.resolve({ purchasePrice });
        },
      );

      await (service as any).finalizeSaleItemSnapshots(10, 'B1', null, null);

      // retailTotal = 1000, flatDiscount = 100
      // item 1: share = 300/1000 * 100 = 30 -> finalPrice = 270
      expect(prisma.saleItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: 101 },
        data: expect.objectContaining({
          retailPriceAtSale: 300,
          discountAmount: 30,
          finalPrice: 270,
          supplyPriceAtSale: 150,
          profitAtSale: 120,
          markupAtSale: 1.8,
        }),
      });

      // item 2: share = 700/1000 * 100 = 70 -> finalPrice = 630
      expect(prisma.saleItem.update).toHaveBeenNthCalledWith(2, {
        where: { id: 102 },
        data: expect.objectContaining({
          retailPriceAtSale: 700,
          discountAmount: 70,
          finalPrice: 630,
          supplyPriceAtSale: 400,
          profitAtSale: 230,
          markupAtSale: 1.575,
        }),
      });
    });

    it('applies a percent discount per item and computes seller bonus from profit', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 11,
        branchCode: null,
        discountAmount: 0,
        discountPercent: 20,
        items: [
          {
            id: 111,
            productId: 5,
            quantity: 2,
            salePrice: 150,
            lineTotal: 300,
            sellerId: null,
          },
        ],
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        purchasePrice: 100,
      });
      (prisma.sellerSalarySettings.findUnique as jest.Mock).mockResolvedValue({
        salaryPercent: 10,
        calculationType: 'PROFIT_PERCENT_ONLY',
        bonusEnabled: true,
        isActive: true,
      });

      await (service as any).finalizeSaleItemSnapshots(11, null, 7, null);

      // retailPriceAtSale = 300, 20% discount = 60 -> finalPrice = 240
      // supplyPriceAtSale = 100 * 2 = 200, profitAtSale = 240 - 200 = 40
      // sellerBonus = 40 * 10% = 4
      expect(prisma.saleItem.update).toHaveBeenCalledWith({
        where: { id: 111 },
        data: expect.objectContaining({
          sellerId: 7,
          retailPriceAtSale: 300,
          discountAmount: 60,
          finalPrice: 240,
          supplyPriceAtSale: 200,
          profitAtSale: 40,
          sellerBonusAmount: 4,
        }),
      });
    });

    it('does nothing for a sale with no items', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 12,
        items: [],
      });

      await (service as any).finalizeSaleItemSnapshots(12, null, null, null);

      expect(prisma.saleItem.update).not.toHaveBeenCalled();
    });
  });

  // Same scenarios as above, but with the mocked Prisma responses returning
  // real Prisma.Decimal instances instead of plain numbers — i.e. what the
  // DB actually returns after the Sale/SaleItem Float -> Decimal migration.
  // Results must match the plain-number tests above exactly.
  describe('recalculateSale (Decimal-backed mock data)', () => {
    const d = (value: number) => new Prisma.Decimal(value);

    it('sums line totals and applies a flat discount', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 1,
        discountPercent: d(0),
        discountAmount: d(500),
        items: [{ lineTotal: d(1000) }, { lineTotal: d(2000) }],
      });

      await (service as any).recalculateSale(1);

      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { total: 3000, payableTotal: 2500 },
      });
    });

    it('combines percent and flat discount and never goes below zero', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 3,
        discountPercent: d(50),
        discountAmount: d(900),
        items: [{ lineTotal: d(1000) }],
      });

      await (service as any).recalculateSale(3);

      expect(prisma.sale.update).toHaveBeenCalledWith({
        where: { id: 3 },
        data: { total: 1000, payableTotal: 0 },
      });
    });
  });

  describe('finalizeSaleItemSnapshots (Decimal-backed mock data)', () => {
    const d = (value: number) => new Prisma.Decimal(value);

    it('prorates a flat discount across multiple items by their share of the retail total, and rounds to 2dp', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 10,
        branchCode: 'B1',
        discountAmount: d(100),
        discountPercent: d(0),
        items: [
          {
            id: 101,
            productId: 1,
            quantity: d(3),
            salePrice: d(100),
            lineTotal: d(300),
            sellerId: null,
          },
          {
            id: 102,
            productId: 2,
            quantity: d(1),
            salePrice: d(700),
            lineTotal: d(700),
            sellerId: null,
          },
        ],
      });
      (prisma.productStock.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.product.findUnique as jest.Mock).mockImplementation(
        ({ where }: any) => {
          const purchasePrice = where.id === 1 ? 50 : 400;
          return Promise.resolve({ purchasePrice });
        },
      );

      await (service as any).finalizeSaleItemSnapshots(10, 'B1', null, null);

      expect(prisma.saleItem.update).toHaveBeenNthCalledWith(1, {
        where: { id: 101 },
        data: expect.objectContaining({
          retailPriceAtSale: 300,
          discountAmount: 30,
          finalPrice: 270,
          supplyPriceAtSale: 150,
          profitAtSale: 120,
          markupAtSale: 1.8,
        }),
      });

      expect(prisma.saleItem.update).toHaveBeenNthCalledWith(2, {
        where: { id: 102 },
        data: expect.objectContaining({
          retailPriceAtSale: 700,
          discountAmount: 70,
          finalPrice: 630,
          supplyPriceAtSale: 400,
          profitAtSale: 230,
          markupAtSale: 1.575,
        }),
      });
    });

    it('applies a percent discount per item and computes seller bonus from profit', async () => {
      const { service, prisma } = createService();
      (prisma.sale.findUnique as jest.Mock).mockResolvedValue({
        id: 11,
        branchCode: null,
        discountAmount: d(0),
        discountPercent: d(20),
        items: [
          {
            id: 111,
            productId: 5,
            quantity: d(2),
            salePrice: d(150),
            lineTotal: d(300),
            sellerId: null,
          },
        ],
      });
      (prisma.product.findUnique as jest.Mock).mockResolvedValue({
        purchasePrice: 100,
      });
      (prisma.sellerSalarySettings.findUnique as jest.Mock).mockResolvedValue({
        salaryPercent: 10,
        calculationType: 'PROFIT_PERCENT_ONLY',
        bonusEnabled: true,
        isActive: true,
      });

      await (service as any).finalizeSaleItemSnapshots(11, null, 7, null);

      expect(prisma.saleItem.update).toHaveBeenCalledWith({
        where: { id: 111 },
        data: expect.objectContaining({
          sellerId: 7,
          retailPriceAtSale: 300,
          discountAmount: 60,
          finalPrice: 240,
          supplyPriceAtSale: 200,
          profitAtSale: 40,
          sellerBonusAmount: 4,
        }),
      });
    });
  });

  describe('writeOffSaleItemsFromStock (low-stock notifications)', () => {
    function createServiceWithStock(stockRow: {
      id: number;
      quantity: number;
      lowStockNotifiedAt: Date | null;
      purchasePrice?: number | null;
      salePrice?: number | null;
    }) {
      const productStockUpdate = jest.fn().mockResolvedValue({ count: 1 });
      const stockMovementCreate = jest.fn();
      const notifyLowStock = jest.fn().mockResolvedValue(undefined);

      const prisma = {
        shop: {
          findFirst: jest.fn().mockResolvedValue({ id: 'shop-1' }),
        },
        productStock: {
          findFirst: jest.fn().mockResolvedValue(stockRow),
          updateMany: productStockUpdate,
          aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 0 } }),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([
            { id: 1, name: 'Test product', sku: 'SKU-1', barcode: null },
          ]),
          update: jest.fn(),
        },
        stockMovement: {
          create: stockMovementCreate,
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
      } as unknown as PrismaService;

      const companySettingsService = {} as CompanySettingsService;
      const usersService = {} as UsersService;
      const telegramService = {
        getLowStockThresholdSettings: jest
          .fn()
          .mockResolvedValue({ enabled: true, threshold: 5 }),
        notifyLowStock,
      } as unknown as TelegramService;

      const service = new SalesService(
        prisma,
        companySettingsService,
        usersService,
        telegramService,
      );

      return { service, prisma, productStockUpdate, notifyLowStock, telegramService };
    }

    const sale = {
      id: 1,
      number: 'S-1',
      companyId: 'company-1',
      userId: 7,
      branchCode: 'B1',
      items: [{ productId: 1, quantity: 3, salePrice: 100 }],
    };

    it('notifies and arms the flag when stock crosses below the threshold', async () => {
      const { service, productStockUpdate, notifyLowStock } = createServiceWithStock({
        id: 55,
        quantity: 6,
        lowStockNotifiedAt: null,
      });

      await (service as any).writeOffSaleItemsFromStock(sale);

      expect(productStockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            lowStockNotifiedAt: expect.any(Date),
          }),
        }),
      );
      expect(notifyLowStock).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'company-1',
          branchCode: 'B1',
          productName: 'Test product',
          quantity: 3,
          threshold: 5,
        }),
      );
    });

    it('does not re-notify when already armed and still below threshold', async () => {
      const { service, productStockUpdate, notifyLowStock } = createServiceWithStock({
        id: 55,
        quantity: 4,
        lowStockNotifiedAt: new Date('2026-01-01'),
      });

      await (service as any).writeOffSaleItemsFromStock(sale);

      const dataArg = (productStockUpdate.mock.calls[0]?.[0] as any)?.data;
      expect(dataArg).not.toHaveProperty('lowStockNotifiedAt');
      expect(notifyLowStock).not.toHaveBeenCalled();
    });

    it('re-arms (clears the flag) once stock rises back above the threshold', async () => {
      const { service, productStockUpdate, notifyLowStock } = createServiceWithStock({
        id: 55,
        quantity: 20,
        lowStockNotifiedAt: new Date('2026-01-01'),
      });

      // A sale that somehow still leaves stock above threshold shouldn't happen via a
      // decrement, so simulate the "rising back above" case via a tiny decrement that
      // still keeps quantity above threshold while a stale flag is set (e.g. after a
      // manual stock correction elsewhere armed it incorrectly).
      await (service as any).writeOffSaleItemsFromStock({
        ...sale,
        items: [{ productId: 1, quantity: 1, salePrice: 100 }],
      });

      expect(productStockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lowStockNotifiedAt: null }),
        }),
      );
      expect(notifyLowStock).not.toHaveBeenCalled();
    });
  });

  describe('writeOffSaleItemsFromStock (concurrent decrement race)', () => {
    // Simulates the DB's atomic conditional UPDATE (the gte-guard) so this
    // test exercises the same interleaving a real race would produce: both
    // calls read quantity=1 before either has decremented, then only the
    // updateMany that still sees quantity >= gte at "commit" time succeeds.
    function createServiceWithSharedStock(initialQuantity: number) {
      let quantity = initialQuantity;

      const prisma = {
        shop: {
          findFirst: jest.fn().mockResolvedValue({ id: 'shop-1' }),
        },
        productStock: {
          findFirst: jest.fn(async () => ({
            id: 99,
            quantity,
            lowStockNotifiedAt: null,
            purchasePrice: 10,
            salePrice: 100,
          })),
          updateMany: jest.fn(async ({ where, data }: any) => {
            if (quantity >= where.quantity.gte) {
              quantity -= data.quantity.decrement;
              return { count: 1 };
            }
            return { count: 0 };
          }),
          aggregate: jest.fn(async () => ({ _sum: { quantity } })),
        },
        product: {
          findMany: jest.fn().mockResolvedValue([]),
          update: jest.fn(),
        },
        stockMovement: {
          create: jest.fn(),
        },
        $transaction: jest.fn(async (fn: any) => fn(prisma)),
      } as unknown as PrismaService;

      const telegramService = {
        getLowStockThresholdSettings: jest
          .fn()
          .mockResolvedValue({ enabled: false, threshold: 0 }),
        notifyLowStock: jest.fn(),
      } as unknown as TelegramService;

      const service = new SalesService(
        prisma,
        {} as CompanySettingsService,
        {} as UsersService,
        telegramService,
      );

      return { service, getQuantity: () => quantity };
    }

    it('exactly one of two concurrent sales for a single unit of stock succeeds; stock never goes negative', async () => {
      const { service, getQuantity } = createServiceWithSharedStock(1);
      const sale = {
        id: 1,
        number: 'S-1',
        companyId: 'company-1',
        userId: 7,
        branchCode: 'B1',
        items: [{ productId: 1, quantity: 1, salePrice: 100 }],
      };

      const results = await Promise.allSettled([
        (service as any).writeOffSaleItemsFromStock(sale),
        (service as any).writeOffSaleItemsFromStock(sale),
      ]);

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(rejected[0].reason).toBeInstanceOf(ConflictException);
      expect(getQuantity()).toBe(0);
    });

    it('under a load of 10 concurrent sales for 1 unit of stock, exactly one succeeds', async () => {
      const { service, getQuantity } = createServiceWithSharedStock(1);
      const sale = {
        id: 1,
        number: 'S-1',
        companyId: 'company-1',
        userId: 7,
        branchCode: 'B1',
        items: [{ productId: 1, quantity: 1, salePrice: 100 }],
      };

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          (service as any).writeOffSaleItemsFromStock(sale),
        ),
      );

      const fulfilled = results.filter((r) => r.status === 'fulfilled');
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === 'rejected',
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(9);
      for (const r of rejected) {
        expect(r.reason).toBeInstanceOf(ConflictException);
      }
      expect(getQuantity()).toBe(0);
    });
  });

  describe('calculateSellerBonusAmount', () => {
    const { service } = createService();

    it('returns 0 when settings are missing', () => {
      const bonus = (service as any).calculateSellerBonusAmount(
        { finalPrice: 100, profitAtSale: 50 },
        null,
      );
      expect(bonus).toBe(0);
    });

    it('returns 0 when bonus is disabled', () => {
      const bonus = (service as any).calculateSellerBonusAmount(
        { finalPrice: 100, profitAtSale: 50 },
        { bonusEnabled: false, salaryPercent: 10 },
      );
      expect(bonus).toBe(0);
    });

    it('computes a percent-of-profit bonus', () => {
      const bonus = (service as any).calculateSellerBonusAmount(
        { finalPrice: 500, profitAtSale: 200 },
        {
          salaryPercent: 15,
          calculationType: 'FIXED_PLUS_PROFIT',
          bonusEnabled: true,
          isActive: true,
        },
      );
      expect(bonus).toBe(30);
    });

    it('computes a percent-of-revenue bonus', () => {
      const bonus = (service as any).calculateSellerBonusAmount(
        { finalPrice: 500, profitAtSale: 200 },
        {
          salaryPercent: 5,
          calculationType: 'REVENUE_PERCENT_ONLY',
          bonusEnabled: true,
          isActive: true,
        },
      );
      expect(bonus).toBe(25);
    });
  });
});
