import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../../test/fixtures/request-context';
import { OrdersService } from './orders.service';

describe('OrdersService.complete concurrency guards', () => {
  function setup() {
    const order = {
      id: 'order-1',
      companyId: 'company-1',
      shopId: 'shop-1',
      userId: 7,
      orderNumber: '000000001',
      orderType: 'SALE',
      status: 'DRAFT',
      customerId: null,
      totalPrice: new Prisma.Decimal(10),
      discountAmount: new Prisma.Decimal(0),
      paidAmount: new Prisma.Decimal(10),
      versionNumber: 1,
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      shop: { id: 'shop-1', branchCode: '001' },
      cashbox: null,
      user: null,
      customer: null,
      items: [
        {
          id: 'item-1',
          productId: 11,
          quantity: new Prisma.Decimal(1),
          price: new Prisma.Decimal(10),
          discountAmount: new Prisma.Decimal(0),
          totalPrice: new Prisma.Decimal(10),
          createdAt: new Date(),
          product: { id: 11, name: 'Product' },
        },
      ],
      payments: [{ amount: new Prisma.Decimal(10), paymentType: null }],
    };
    let claimed = false;
    let stock = 1;
    const tx: any = {
      order: {
        findFirst: jest.fn(async () =>
          claimed ? { ...order, status: 'COMPLETED', versionNumber: 2 } : order,
        ),
        updateMany: jest.fn(async () => {
          if (claimed) return { count: 0 };
          claimed = true;
          return { count: 1 };
        }),
        update: jest.fn(async () => ({})),
      },
      productStock: {
        findFirst: jest.fn(async () => ({
          id: 21,
          quantity: stock,
          purchasePrice: 4,
          salePrice: 10,
        })),
        updateMany: jest.fn(async () => {
          if (stock < 1) return { count: 0 };
          stock -= 1;
          return { count: 1 };
        }),
        aggregate: jest.fn(async () => ({ _sum: { quantity: stock } })),
      },
      stockMovement: {
        create: jest.fn(async () => ({ id: 'movement-1' })),
      },
      product: { update: jest.fn(async () => ({})) },
      auditLog: { create: jest.fn(async () => ({})) },
      clientDebt: { create: jest.fn(), aggregate: jest.fn() },
      client: { update: jest.fn() },
    };
    const prisma: any = {
      $transaction: jest.fn((operation) => operation(tx)),
    };

    return { service: new OrdersService(prisma), tx, prisma };
  }

  it('allows only one completion and one stock write-off', async () => {
    const { service, tx, prisma } = setup();

    const results = await Promise.allSettled([
      service.complete(
        'order-1',
        {},
        testContext({ allowedBranchCodes: ['001'] }),
      ),
      service.complete(
        'order-1',
        {},
        testContext({ allowedBranchCodes: ['001'] }),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(tx.productStock.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.stockMovement.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });

  it('uses a conditional decrement that cannot make stock negative', async () => {
    const { service, tx } = setup();
    await service.complete(
      'order-1',
      {},
      testContext({ allowedBranchCodes: ['001'] }),
    );
    expect(tx.productStock.updateMany).toHaveBeenCalledWith({
      where: { id: 21, quantity: { gte: 1 } },
      data: { quantity: { decrement: 1 } },
    });
  });

  it('requires the centralized company context with an available shop', async () => {
    const { service } = setup();

    await service.complete(
      'order-1',
      {},
      testContext({ allowedBranchCodes: ['001'] }),
    );

    await expect(
      service.complete('order-1', {}, testContext({ allowedShopIds: [] })),
    ).rejects.toThrow('No available shops');
  });
});
