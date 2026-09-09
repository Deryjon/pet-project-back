import { BadRequestException, ConflictException } from '@nestjs/common';
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

  function createTx(stock: Record<string, unknown> | null, updatedCount = 1) {
    return {
      productStock: {
        findFirst: jest.fn().mockResolvedValue(stock),
        updateMany: jest.fn().mockResolvedValue({ count: updatedCount }),
      },
      stockMovement: {
        create: jest.fn().mockResolvedValue({ id: 'movement-1' }),
      },
    };
  }

  it('rejects missing stock without creating a negative stock row or movement', async () => {
    const tx = createTx(null);

    await expect(
      postSaleStockDecrease(tx as any, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.productStock.updateMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it('scopes stock lookup by company and shop and posts the movement atomically', async () => {
    const tx = createTx({
      id: 5,
      quantity: 7,
      purchasePrice: 60,
      salePrice: 90,
      lowStockNotifiedAt: null,
    });

    const result = await postSaleStockDecrease(tx as any, input);

    expect(tx.productStock.findFirst).toHaveBeenCalledWith({
      where: {
        productId: 11,
        shopId: 'shop-1',
        branchCode: 'B1',
        product: { companyId: 'company-1' },
      },
    });
    expect(tx.productStock.updateMany).toHaveBeenCalledWith({
      where: { id: 5, quantity: { gte: 2 } },
      data: { quantity: { decrement: 2 } },
    });
    expect(tx.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'company-1',
        shopId: 'shop-1',
        productId: 11,
        type: 'SALE',
        quantity: 2,
        beforeQuantity: 7,
        afterQuantity: 5,
      }),
      select: { id: true },
    });
    expect(result).toEqual({
      movement: { id: 'movement-1' },
      beforeQuantity: 7,
      afterQuantity: 5,
      crossedBelowLowStockThreshold: false,
    });
  });

  it('rejects a concurrent depletion when the conditional update loses the race', async () => {
    const tx = createTx(
      {
        id: 5,
        quantity: 2,
        purchasePrice: 60,
        salePrice: 90,
        lowStockNotifiedAt: null,
      },
      0,
    );

    await expect(
      postSaleStockDecrease(tx as any, input),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(tx.stockMovement.create).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid sale quantity %s before reading stock',
    async (quantity) => {
      const tx = createTx(null);

      await expect(
        postSaleStockDecrease(tx as any, { ...input, quantity }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(tx.productStock.findFirst).not.toHaveBeenCalled();
    },
  );
});
