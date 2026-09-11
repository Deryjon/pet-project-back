import { randomUUID, createHash } from 'crypto';
import { PrismaService } from '../../src/prisma/prisma.service';
import { OrdersService } from '../../src/modules/orders/orders.service';
import { ClientsService } from '../../src/clients/clients.service';
import { WarehouseService } from '../../src/warehouse/warehouse.service';
import { SalesService } from '../../src/sales/sales.service';
import { CompanySettingsService } from '../../src/company-settings/company-settings.service';
import { AuthService } from '../../src/auth/auth.service';
import { database, fixture, order, overlappingTransactions } from './support';

const databaseHandle = database();
const db = databaseHandle.client;
const prisma = db as unknown as PrismaService;
const fulfilled = (results: PromiseSettledResult<unknown>[]) =>
  results.filter((r) => r.status === 'fulfilled');
function expectDomainRejection(
  results: PromiseSettledResult<unknown>[],
  allowedStatus: number[],
) {
  const rejected = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );
  expect(rejected).toHaveLength(1);
  expect(allowedStatus).toContain(rejected[0].reason.getStatus?.());
}

afterAll(() => databaseHandle.close());

async function stockState(f: Awaited<ReturnType<typeof fixture>>) {
  const stocks = await db.productStock.findMany({
    where: { productId: f.product.id },
  });
  const product = await db.product.findUniqueOrThrow({
    where: { id: f.product.id },
  });
  const movements = await db.stockMovement.findMany({
    where: { productId: f.product.id },
  });
  return { stocks, product, movements };
}

describe('real PostgreSQL transaction invariants', () => {
  it('completes the same order only once and retries a real serialization conflict', async () => {
    const f = await fixture(db);
    const draft = await order(db, f);
    const overlap = overlappingTransactions(db);
    const service = new OrdersService(overlap.prisma);
    const results = await Promise.allSettled([
      service.complete(draft.id, {}, f.context),
      service.complete(draft.id, {}, f.context),
    ]);
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [400, 409]);
    expect(overlap.attempts()).toBeGreaterThanOrEqual(3);
    const state = await stockState(f);
    expect(state.stocks[0].quantity).toBe(0);
    expect(state.product.quantity).toBe(0);
    expect(state.movements).toHaveLength(1);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: draft.id } })).status,
    ).toBe('COMPLETED');
  });

  it('lets only one of two different orders take the last unit', async () => {
    const f = await fixture(db);
    const drafts = await Promise.all([order(db, f), order(db, f)]);
    const service = new OrdersService(overlappingTransactions(db).prisma);
    const results = await Promise.allSettled(
      drafts.map((draft) => service.complete(draft.id, {}, f.context)),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [400, 409]);
    const state = await stockState(f);
    expect(state.stocks[0].quantity).toBe(0);
    expect(state.product.quantity).toBe(0);
    expect(state.movements).toHaveLength(1);
    expect(
      await db.order.count({
        where: { id: { in: drafts.map((d) => d.id) }, status: 'DRAFT' },
      }),
    ).toBe(1);
  });

  it('rolls back status, stock and movements when a later order item cannot be posted', async () => {
    const f = await fixture(db);
    const draft = await order(db, f);
    const missing = await db.product.create({
      data: { companyId: f.company.id, name: 'No stock' },
    });
    await db.orderItem.create({
      data: {
        orderId: draft.id,
        productId: missing.id,
        quantity: 1,
        price: 0,
        totalPrice: 0,
      },
    });
    const service = new OrdersService(prisma);
    await expect(service.complete(draft.id, {}, f.context)).rejects.toThrow(
      'Недостаточно остатка',
    );
    const state = await stockState(f);
    expect(state.stocks[0].quantity).toBe(1);
    expect(state.product.quantity).toBe(1);
    expect(state.movements).toHaveLength(0);
    expect(
      (await db.order.findUniqueOrThrow({ where: { id: draft.id } })).status,
    ).toBe('DRAFT');
    expect(
      await db.auditLog.count({ where: { companyId: f.company.id } }),
    ).toBe(0);
  });

  it('does not overpay a debt with concurrent repayments', async () => {
    const f = await fixture(db);
    const debt = await db.clientDebt.create({
      data: {
        companyId: f.company.id,
        clientId: f.customer.id,
        amountUzs: 100,
        remainingAmountUzs: 100,
      },
    });
    await db.client.update({
      where: { id: f.customer.id },
      data: { debtUzs: 100 },
    });
    const service = new ClientsService(
      overlappingTransactions(db).prisma,
      new CompanySettingsService(prisma),
    );
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.repayDebt(
          f.customer.id,
          debt.id,
          { amount_uzs: 60 },
          f.context,
        ),
      ),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [400, 409]);
    const persisted = await db.clientDebt.findUniqueOrThrow({
      where: { id: debt.id },
    });
    expect(persisted.remainingAmountUzs.toNumber()).toBe(40);
    expect(persisted.repaidAmountUzs.toNumber()).toBe(60);
    expect(
      await db.clientDebtRepayment.count({ where: { debtId: debt.id } }),
    ).toBe(1);
    expect(
      (
        await db.client.findUniqueOrThrow({ where: { id: f.customer.id } })
      ).debtUzs.toNumber(),
    ).toBe(40);
  });

  it('returns the same result for concurrent repayments with the same idempotency key', async () => {
    const f = await fixture(db);
    const debt = await db.clientDebt.create({
      data: {
        companyId: f.company.id,
        clientId: f.customer.id,
        amountUzs: 100,
        remainingAmountUzs: 100,
      },
    });
    const service = new ClientsService(
      overlappingTransactions(db).prisma,
      new CompanySettingsService(prisma),
    );
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.repayDebt(
          f.customer.id,
          debt.id,
          { amount_uzs: 60, idempotency_key: 'one-request' },
          f.context,
        ),
      ),
    );
    expect(fulfilled(results)).toHaveLength(2);
    expect(
      await db.clientDebtRepayment.count({ where: { debtId: debt.id } }),
    ).toBe(1);
    expect(
      (
        await db.clientDebt.findUniqueOrThrow({ where: { id: debt.id } })
      ).remainingAmountUzs.toNumber(),
    ).toBe(40);
  });

  it('applies an inventory session only once, creating its missing stock row and movement', async () => {
    const f = await fixture(db, 0);
    await db.productStock.deleteMany({ where: { productId: f.product.id } });
    const inventory = await db.inventorySession.create({
      data: {
        companyId: f.company.id,
        shopId: f.shop.id,
        createdById: f.user.id,
        name: 'Count',
        items: { create: { productId: f.product.id, actualQuantity: 7 } },
      },
    });
    const service = new WarehouseService(overlappingTransactions(db).prisma);
    const results = await Promise.allSettled(
      [1, 2].map(() => service.applyInventory(inventory.id, f.context)),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [400, 409]);
    const state = await stockState(f);
    expect(state.stocks).toHaveLength(1);
    expect(state.stocks[0].quantity).toBe(7);
    expect(state.product.quantity).toBe(7);
    expect(state.movements).toHaveLength(1);
    expect(state.movements[0].quantity.toNumber()).toBe(7);
    expect(
      (
        await db.inventorySession.findUniqueOrThrow({
          where: { id: inventory.id },
        })
      ).status,
    ).toBe('completed');
  });

  it('prevents duplicate stock rows under concurrent upsert', async () => {
    const f = await fixture(db, 0);
    await db.productStock.deleteMany({ where: { productId: f.product.id } });
    await Promise.all(
      [1, 2].map(() =>
        db.productStock.upsert({
          where: {
            productId_shopId: { productId: f.product.id, shopId: f.shop.id },
          },
          create: {
            productId: f.product.id,
            shopId: f.shop.id,
            branchCode: '001',
            quantity: 1,
          },
          update: { quantity: { increment: 1 } },
        }),
      ),
    );
    const stocks = await db.productStock.findMany({
      where: { productId: f.product.id },
    });
    expect(stocks).toHaveLength(1);
    expect(stocks[0].quantity).toBe(2);
  });

  it('posts a legacy sale only once under concurrent payment', async () => {
    const f = await fixture(db);
    const sale = await db.sale.create({
      data: {
        companyId: f.company.id,
        userId: f.user.id,
        branchCode: '001',
        number: randomUUID(),
        total: 10,
        payableTotal: 10,
        items: {
          create: {
            productId: f.product.id,
            name: 'Product',
            quantity: 1,
            salePrice: 10,
            lineTotal: 10,
          },
        },
      },
    });
    const notifications = {
      getLowStockThresholdSettings: async () => ({
        enabled: false,
        threshold: 0,
      }),
      notifySale: jest.fn().mockResolvedValue(undefined),
    };
    const service = new SalesService(
      overlappingTransactions(db).prisma,
      new CompanySettingsService(prisma),
      notifications as any,
    );
    const results = await Promise.allSettled(
      [1, 2].map(() =>
        service.pay(sale.id, { payment_method: 'test-cash' }, f.context),
      ),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [400, 409]);
    const state = await stockState(f);
    expect(state.stocks[0].quantity).toBe(0);
    expect(state.product.quantity).toBe(0);
    expect(state.movements).toHaveLength(1);
    expect(
      (await db.sale.findUniqueOrThrow({ where: { id: sale.id } })).isDraft,
    ).toBe(false);
    expect(notifications.notifySale).toHaveBeenCalledTimes(1);
  });

  it('rotates a refresh session once and rolls back the losing replacement row', async () => {
    const f = await fixture(db);
    const sessionId = randomUUID();
    await db.authSession.create({
      data: {
        id: sessionId,
        userId: f.user.id,
        refreshTokenHash: createHash('sha256')
          .update('old-refresh')
          .digest('hex'),
        expiresAt: new Date(Date.now() + 60000),
      },
    });
    let counter = 0;
    const jwt = {
      verifyAsync: async () => ({ sub: f.user.id, sessionId, type: 'refresh' }),
      signAsync: async () => `test-token-${++counter}`,
      decode: () => ({ exp: Math.floor(Date.now() / 1000) + 3600 }),
    };
    const users = {
      prepareAuthenticatedUser: async () => f.user,
      toAuthProfile: async () => ({
        user_type: 'company',
        company_id: f.company.id,
        current_shop_id: f.shop.id,
        current_shop: { branch_code: '001' },
      }),
    };
    const config = {
      get: (key: string) =>
        key === 'JWT_REFRESH_SECRET' ? 'test-secret' : undefined,
    };
    const service = new AuthService(
      users as any,
      jwt as any,
      config as any,
      overlappingTransactions(db).prisma,
      {} as any,
    );
    const results = await Promise.allSettled(
      [1, 2].map(() => service.refresh({ refresh_token: 'old-refresh' })),
    );
    expect(fulfilled(results)).toHaveLength(1);
    expectDomainRejection(results, [401]);
    const sessions = await db.authSession.findMany({
      where: { userId: f.user.id },
    });
    expect(sessions).toHaveLength(2);
    const original = sessions.find((s) => s.id === sessionId)!;
    expect(original.revokedAt).not.toBeNull();
    expect(
      sessions.filter((s) => s.revokedAt === null).map((s) => s.id),
    ).toEqual([original.replacedById]);
  });
});
