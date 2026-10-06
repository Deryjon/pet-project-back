import { BadRequestException } from '@nestjs/common';
import { ProductsService } from './products.service';

const context = {
  userId: 1,
  fullName: 'Admin',
  userType: 'company',
  role: 'role',
  crmRoleId: 'role',
  crmRoleName: 'Admin',
  companyId: 'company-a',
  currentShopId: 'shop-a',
  currentBranchCode: 'A',
  allowedShopIds: ['shop-a', 'shop-b'],
  allowedBranchCodes: ['A', 'B'],
  canSwitchShops: true,
} as const;

/**
 * In-memory Transfer/ProductStock tables. Both requests below read the
 * transfer before either writes — the stale read a concurrent pair would see.
 */
function setup(initialStatus: 'DRAFT' | 'SENT') {
  const state = {
    status: initialStatus as string,
    stocks: new Map<string, number>([
      ['A', 10],
      ['B', 0],
    ]),
    arrived: 0,
  };
  const staleTransfer = {
    id: 'transfer-1',
    externalId: 7,
    companyId: 'company-a',
    status: initialStatus,
    departureShopId: 'shop-a',
    arrivalShopId: 'shop-b',
    departureShop: { id: 'shop-a', branchCode: 'A' },
    arrivalShop: { id: 'shop-b', branchCode: 'B' },
    items: [
      {
        id: 'item-1',
        productId: 5,
        variantId: null,
        quantity: 4,
        product: {
          name: 'Product',
          purchasePrice: 1,
          salePrice: 2,
          stocks: [{ branchCode: 'A', purchasePrice: 1, salePrice: 2 }],
        },
      },
    ],
  };
  const tx = {
    transfer: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      }),
    },
    productStock: {
      updateMany: jest.fn(async ({ where, data }: any) => {
        const quantity = state.stocks.get(where.branchCode) ?? 0;
        if (quantity < where.quantity.gte) return { count: 0 };
        state.stocks.set(where.branchCode, quantity - data.quantity.decrement);
        return { count: 1 };
      }),
      findFirstOrThrow: jest.fn(async ({ where }: any) => ({
        quantity: state.stocks.get(where.branchCode),
        purchasePrice: 1,
        salePrice: 2,
      })),
      findFirst: jest.fn(async () => ({ purchasePrice: 1, salePrice: 2 })),
      upsert: jest.fn(async ({ where, update }: any) => {
        const branchCode = where.productId_branchCode.branchCode;
        const quantity =
          (state.stocks.get(branchCode) ?? 0) + update.quantity.increment;
        state.stocks.set(branchCode, quantity);
        return { quantity };
      }),
    },
    transferItem: {
      update: jest.fn(async ({ data }: any) => {
        state.arrived = data.arrivedQuantity;
      }),
    },
  };
  const prisma = { $transaction: jest.fn((fn: any) => fn(tx)) };
  const service = new ProductsService(prisma as any, {} as any);
  jest
    .spyOn(service as any, 'findTransferOrThrow')
    .mockResolvedValue(staleTransfer);
  jest
    .spyOn(service as any, 'syncProductTotalQuantity')
    .mockResolvedValue(undefined);
  jest
    .spyOn(service as any, 'createStockMovementRecord')
    .mockResolvedValue(undefined);
  jest.spyOn(service, 'getTransferById').mockResolvedValue({} as any);
  return { state, service };
}

describe('ProductsService transfer status claims', () => {
  it('moves departure stock only once when a transfer is sent twice', async () => {
    const { state, service } = setup('DRAFT');

    await service.sendTransfer('transfer-1', context as any);
    await expect(
      service.sendTransfer('transfer-1', context as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.status).toBe('SENT');
    expect(state.stocks.get('A')).toBe(6);
  });

  it('adds arrival stock only once when a transfer is accepted twice', async () => {
    const { state, service } = setup('SENT');

    await service.acceptTransfer('transfer-1', context as any);
    await expect(
      service.acceptTransferVerified('transfer-1', {}, context as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.status).toBe('ACCEPTED');
    expect(state.stocks.get('B')).toBe(4);
  });

  it('does not accept more than was sent', async () => {
    const { state, service } = setup('SENT');

    await service.acceptTransferVerified(
      'transfer-1',
      { items: [{ item_id: 'item-1', arrived_quantity: 1000 }] },
      context as any,
    );

    expect(state.stocks.get('B')).toBe(4);
    expect(state.arrived).toBe(4);
  });

  it('cannot cancel a sent transfer that was accepted meanwhile', async () => {
    const { state, service } = setup('SENT');

    await service.acceptTransfer('transfer-1', context as any);
    await expect(
      service.cancelTransfer('transfer-1', context as any),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(state.status).toBe('ACCEPTED');
    expect(state.stocks.get('A')).toBe(10);
  });
});
