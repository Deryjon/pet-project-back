import { BadRequestException, ConflictException } from '@nestjs/common';
import { createStockLedgerFake } from '../../test/fixtures/stock-ledger-fake';
import { postSaleStockDecrease } from './sale-stock-posting';

describe('postSaleStockDecrease', () => {
  const input = {
    companyId: 'company-1',
    shopId: 'shop-1',
    branchCode: 'B1',
    productId: 11,
    quantity: 2,
    createdById: 7,
    externalId: 'SALE-1',
    retailPrice: 100,
  };

  function ledger(quantity: number | null, extra: Record<string, unknown> = {}) {
    return createStockLedgerFake({
      products: [{ id: 11 }],
      stocks:
        quantity === null
          ? []
          : [
              {
                productId: 11,
                shopId: 'shop-1',
                branchCode: 'B1',
                quantity,
                purchasePrice: 60,
                salePrice: 90,
                ...extra,
              },
            ],
    });
  }

  it('rejects missing stock without creating a negative stock row or movement', async () => {
    const fake = ledger(null);

    await expect(
      postSaleStockDecrease(fake.tx as any, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(fake.shopStocks).toEqual([]);
    expect(fake.movements).toEqual([]);
  });

  it('decrements the default variant and posts the movement with shop quantities', async () => {
    const fake = ledger(7);

    const result = await postSaleStockDecrease(fake.tx as any, input);

    expect(fake.tx.productVariantStock.updateMany).toHaveBeenCalledWith({
      where: { variantId: 'default-11', shopId: 'shop-1', quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
    expect(fake.shopQuantity(11, 'shop-1')).toBe(5);
    expect(fake.movements).toEqual([
      expect.objectContaining({
        companyId: 'company-1',
        shopId: 'shop-1',
        productId: 11,
        variantId: 'default-11',
        type: 'SALE',
        quantity: 2,
        beforeQuantity: 7,
        afterQuantity: 5,
        supplyPrice: 60,
        fromRetailPrice: 90,
      }),
    ]);
    expect(result).toEqual({
      movement: { id: expect.any(String) },
      beforeQuantity: 7,
      afterQuantity: 5,
      crossedBelowLowStockThreshold: false,
    });
  });

  it('does not touch stock of a product from another company', async () => {
    const fake = ledger(7);

    await expect(
      postSaleStockDecrease(fake.tx as any, { ...input, companyId: 'company-2' }),
    ).rejects.toThrow();
    expect(fake.shopQuantity(11, 'shop-1')).toBe(7);
  });

  it('lets only one of two concurrent sales take the last units', async () => {
    const fake = ledger(2);

    const results = await Promise.allSettled([
      postSaleStockDecrease(fake.tx as any, input),
      postSaleStockDecrease(fake.tx as any, input),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      (results.find((r) => r.status === 'rejected') as PromiseRejectedResult)
        .reason,
    ).toBeInstanceOf(ConflictException);
    expect(fake.shopQuantity(11, 'shop-1')).toBe(0);
    expect(fake.movements).toHaveLength(1);
  });

  it('arms the low-stock flag when the sale crosses the threshold', async () => {
    const fake = ledger(6);

    const result = await postSaleStockDecrease(fake.tx as any, {
      ...input,
      lowStockThreshold: 5,
    });

    expect(result.crossedBelowLowStockThreshold).toBe(true);
    expect(fake.shopStocks[0].lowStockNotifiedAt).toBeInstanceOf(Date);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid sale quantity %s before reading stock',
    async (quantity) => {
      const fake = ledger(7);

      await expect(
        postSaleStockDecrease(fake.tx as any, { ...input, quantity }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(fake.tx.productVariant.findFirst).not.toHaveBeenCalled();
    },
  );
});
