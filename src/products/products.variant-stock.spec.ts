import { BadRequestException, ConflictException } from '@nestjs/common';
import { SalesService } from '../sales/sales.service';
import { ProductsService } from './products.service';

type StockRow = {
  id: number;
  productId: number;
  shopId: string;
  branchCode: string;
  quantity: number;
  purchasePrice: number | null;
  salePrice: number | null;
};

/** Minimal in-memory ProductStock table supporting the calls under test. */
function createStockDb(rows: StockRow[]) {
  let nextId = 1000;
  const productStock = {
    findMany: jest.fn(async ({ where }: any) =>
      rows.filter((row) => row.productId === where.productId).map((row) => ({ ...row })),
    ),
    update: jest.fn(async ({ where, data }: any) => {
      const row = rows.find((candidate) => candidate.id === where.id)!;
      const { quantity, ...rest } = data;
      Object.assign(row, rest);
      row.quantity =
        typeof quantity === 'object' ? row.quantity + quantity.increment : quantity;
      return { ...row };
    }),
    create: jest.fn(async ({ data }: any) => {
      const row = { id: nextId++, purchasePrice: null, salePrice: null, ...data };
      rows.push(row);
      return { ...row };
    }),
  };
  const product = { update: jest.fn() };
  const tx = { productStock, product, productVariantStock: { findMany: jest.fn() } };
  const prisma = { ...tx, $transaction: jest.fn((fn: any) => fn(tx)) };
  return { rows, tx, prisma };
}

describe('ProductsService variative product stock', () => {
  it('derives per-shop ProductStock from active colour/size variant stocks', async () => {
    const { rows, tx, prisma } = createStockDb([
      // Created by the catalog form with quantity 0 — the "unsellable" bug.
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 0, purchasePrice: 10, salePrice: 20 },
    ]);
    tx.productVariantStock.findMany.mockResolvedValue([
      { shopId: 'shop-a', branchCode: 'A', quantity: 3, purchasePrice: 10, salePrice: 20 },
      { shopId: 'shop-a', branchCode: 'A', quantity: 2, purchasePrice: 10, salePrice: 20 },
      { shopId: 'shop-b', branchCode: 'B', quantity: 4, purchasePrice: 11, salePrice: 21 },
    ]);
    const service = new ProductsService(prisma as any, {} as any);

    await (service as any).syncVariativeProductStocks(tx, 5);

    const where = tx.productVariantStock.findMany.mock.calls[0][0].where;
    expect(where.variant).toMatchObject({ productId: 5, isActive: true });
    expect(where.variant.OR).toEqual([
      { colorId: { not: null } },
      { sizeId: { not: null } },
    ]);
    expect(rows.map((row) => [row.shopId, row.quantity])).toEqual([
      ['shop-a', 5],
      ['shop-b', 4],
    ]);
    expect(tx.product.update).toHaveBeenCalledWith({
      where: { id: 5 },
      data: { quantity: 9 },
    });
  });

  it('zeroes ProductStock in a shop that no longer has variant stock', async () => {
    const { rows, tx, prisma } = createStockDb([
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 7, purchasePrice: 1, salePrice: 2 },
    ]);
    tx.productVariantStock.findMany.mockResolvedValue([]);
    const service = new ProductsService(prisma as any, {} as any);

    await (service as any).syncVariativeProductStocks(tx, 5);

    expect(rows[0].quantity).toBe(0);
  });
});

describe('ProductsService simple product stock edits', () => {
  const shipment = (quantity: number, originalQuantity?: number) => ({
    shopId: 'shop-a',
    branchCode: 'A',
    quantity,
    originalQuantity,
    supplyPrice: 10,
    retailPrice: 20,
  });

  it('applies the edit as a delta so sales made while the form was open survive', async () => {
    // Form opened at 13; 3 were sold meanwhile (row is now 10); user typed 15.
    const { rows, prisma } = createStockDb([
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 10, purchasePrice: 10, salePrice: 20 },
    ]);
    const service = new ProductsService(prisma as any, {} as any);

    const result = await (service as any).applySimpleProductStockEdits(5, [
      shipment(15, 13),
    ]);

    expect(rows[0].quantity).toBe(12);
    expect(result.applied[0].quantity).toBe(12);
    expect(result.previous[0].quantity).toBe(10);
  });

  it('sets the quantity absolutely when no original is sent (legacy clients)', async () => {
    const { rows, prisma } = createStockDb([
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 10, purchasePrice: 10, salePrice: 20 },
    ]);
    const service = new ProductsService(prisma as any, {} as any);

    await (service as any).applySimpleProductStockEdits(5, [shipment(15)]);

    expect(rows[0].quantity).toBe(15);
  });

  it('leaves shops missing from the payload untouched', async () => {
    const { rows, prisma } = createStockDb([
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 10, purchasePrice: 10, salePrice: 20 },
      { id: 2, productId: 5, shopId: 'shop-b', branchCode: 'B', quantity: 8, purchasePrice: 10, salePrice: 20 },
    ]);
    const service = new ProductsService(prisma as any, {} as any);

    await (service as any).applySimpleProductStockEdits(5, [shipment(11, 10)]);

    expect(rows.find((row) => row.shopId === 'shop-b')!.quantity).toBe(8);
  });

  it('rejects an edit that would make stock negative', async () => {
    // Form opened at 5; all 5 sold meanwhile; user reduced to 2 (delta -3).
    const { prisma } = createStockDb([
      { id: 1, productId: 5, shopId: 'shop-a', branchCode: 'A', quantity: 0, purchasePrice: 10, salePrice: 20 },
    ]);
    const service = new ProductsService(prisma as any, {} as any);

    await expect(
      (service as any).applySimpleProductStockEdits(5, [shipment(2, 5)]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('SalesService colour/size selection', () => {
  const buildService = (variantCount: number) => {
    const prisma = {
      productVariant: { count: jest.fn().mockResolvedValue(variantCount) },
    };
    return new SalesService(prisma as any, {} as any, {} as any);
  };

  it('refuses to sell a colour/size product without a chosen variant', async () => {
    await expect(
      (buildService(2) as any).assertNoColourSizeVariants(5, 'company-1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows a product without colour/size variants', async () => {
    await expect(
      (buildService(0) as any).assertNoColourSizeVariants(5, 'company-1'),
    ).resolves.toBeUndefined();
  });
});

describe('SalesService client purchase aggregates', () => {
  it('ignores cancelled documents and subtracts returns', async () => {
    const tx = {
      sale: {
        count: jest.fn().mockResolvedValue(3),
        aggregate: jest
          .fn()
          .mockResolvedValueOnce({
            _sum: { payableTotal: 500 },
            _max: { paidAt: new Date('2026-10-01'), createdAt: null },
          })
          .mockResolvedValueOnce({ _sum: { payableTotal: 120 } }),
      },
      client: { update: jest.fn() },
    };
    const service = new SalesService({} as any, {} as any, {} as any);

    await (service as any).refreshClientSalesAggregates(tx, 'company-1', 'client-1');

    expect(tx.sale.count.mock.calls[0][0].where.status).toEqual({ not: 'cancelled' });
    expect(tx.sale.aggregate.mock.calls[1][0].where).toMatchObject({
      saleType: 'return',
      status: { not: 'cancelled' },
    });
    const data = tx.client.update.mock.calls[0][0].data;
    expect(Number(data.totalPurchasesUzs)).toBe(380);
    expect(data.visitsCount).toBe(3);
  });
});

describe('ProductsService size grid presets and variant codes', () => {
  it('fills missing variant barcodes/SKUs and keeps existing ones', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([{ barcode: '2000000000017' }]),
        findUnique: jest.fn().mockResolvedValue({ sku: 'TSH' }),
      },
      productVariant: {
        findMany: jest
          .fn()
          // barcodes already used by variants
          .mockResolvedValueOnce([{ barcode: '2000000000024' }])
          // SKUs already used with the TSH- prefix
          .mockResolvedValueOnce([{ sku: 'TSH-01' }]),
      },
    };
    const service = new ProductsService(prisma as any, {} as any) as any;
    const items: Array<{ id?: string; barcode?: string; sku?: string }> = [
      { id: 'v-old' },
      { barcode: '4600000000000' },
      {},
    ];

    await service.fillMissingVariantCodes(5, 'company-1', items, [
      { id: 'v-old', barcode: '2000000000031', sku: 'TSH-05' },
    ]);

    expect(items[0]).toEqual({ id: 'v-old', barcode: '2000000000031', sku: 'TSH-05' });
    expect(items[1].barcode).toBe('4600000000000');
    // New codes never collide with product or variant barcodes.
    expect(items[2].barcode).toMatch(/^2\d{12}$/);
    expect(['2000000000017', '2000000000024', '2000000000031']).not.toContain(items[2].barcode);
    expect(items[1].sku).toBe('TSH-02');
    expect(items[2].sku).toBe('TSH-03');
  });

  it('creates preset sizes and a basic palette on first use', async () => {
    const prisma = {
      productSize: {
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([
          { id: 's-m', name: 'M', type: 'CLOTHING' },
          { id: 's-42', name: '42', type: 'SHOES' },
          { id: 's-custom', name: 'Free', type: 'OTHER' },
        ]),
      },
      productColor: {
        count: jest.fn().mockResolvedValue(0),
        createMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([{ id: 'c-black', name: 'Чёрный' }]),
      },
    };
    const service = new ProductsService(prisma as any, {} as any);
    const context = {
      userId: 1, fullName: '', userType: 'company', role: null, crmRoleId: null,
      crmRoleName: null, companyId: 'company-1', currentShopId: null,
      currentBranchCode: null, allowedShopIds: [], allowedBranchCodes: [], canSwitchShops: false,
    } as any;

    const result = await service.getSizeGridPresets(context);

    expect(prisma.productSize.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
    expect(prisma.productColor.createMany).toHaveBeenCalled();
    expect(result.grids.find((grid) => grid.key === 'clothing_letter')?.sizes).toEqual([
      { id: 's-m', name: 'M' },
    ]);
    expect(result.grids.find((grid) => grid.key === 'shoes')?.sizes).toEqual([
      { id: 's-42', name: '42' },
    ]);
    expect(result.grids.at(-1)).toEqual({
      key: 'custom',
      name: 'Свои размеры',
      sizes: [{ id: 's-custom', name: 'Free' }],
    });
  });
});
