import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../test/fixtures/request-context';
import { moveVariantStock } from '../common/stock-ledger';
import { PurchaseOrdersService } from './purchase-orders.service';

jest.mock('../common/stock-ledger', () => ({
  moveVariantStock: jest.fn(async (_tx, input) => ({
    variantId: input.variantId ?? 'default-variant',
    delta: input.delta,
    beforeQuantity: 0,
    afterQuantity: input.delta,
    stock: null,
  })),
}));

jest.mock('../auth/role-permissions', () => ({
  loadRoleAccess: jest.fn(async () => ({})),
  roleAccessAllows: jest.fn(() => true),
}));

type Item = {
  id: string;
  orderId: string;
  productId: number;
  variantId: string | null;
  name: string;
  sku: string | null;
  barcode: string | null;
  quantity: Prisma.Decimal;
  receivedQuantity: Prisma.Decimal;
  supplyPrice: Prisma.Decimal;
};

// A tiny in-memory store: enough of Prisma for the order life cycle.
function setup(status: string = 'SENT') {
  const order: any = {
    id: 'po-1',
    number: 12,
    companyId: 'company-1',
    supplierId: 3,
    shopId: 'shop-1',
    status,
    comment: null,
    expectedAt: null,
    createdById: 7,
    sentAt: null,
    receivedAt: null,
    receivedById: null,
    cancelledAt: null,
    cancelledById: null,
    cancelReason: null,
    createdAt: new Date('2026-10-13T08:00:00Z'),
    updatedAt: new Date('2026-10-13T08:00:00Z'),
    supplier: { id: 3, name: 'Поставщик', phone: null },
    shop: { id: 'shop-1', name: 'Чиланзар', branchCode: 'B1' },
  };
  const items: Item[] = [
    {
      id: 'i-1',
      orderId: 'po-1',
      productId: 10,
      variantId: null,
      name: 'Футболка',
      sku: 'T-1',
      barcode: '200',
      quantity: new Prisma.Decimal(10),
      receivedQuantity: new Prisma.Decimal(0),
      supplyPrice: new Prisma.Decimal(100),
    },
  ];
  const stockMovementCreate = jest.fn();
  const supplierUpsert = jest.fn();
  const auditCreate = jest.fn();
  const db: any = {
    $queryRaw: jest.fn(async () => []),
    purchaseOrder: {
      findFirst: jest.fn(async ({ where }: any) =>
        where.id === order.id && where.companyId === order.companyId ? { ...order, items: [...items] } : null,
      ),
      update: jest.fn(async ({ data }: any) => Object.assign(order, data)),
      updateMany: jest.fn(async ({ where, data }: any) => {
        const allowed = where.status?.in ?? [where.status];
        if (where.id !== order.id || !allowed.includes(order.status)) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      }),
      create: jest.fn(async ({ data }: any) => ({
        ...order,
        ...data,
        status: 'DRAFT',
        items: data.items.create.map((row: any, index: number) => ({
          id: `n-${index}`,
          orderId: order.id,
          receivedQuantity: new Prisma.Decimal(0),
          ...row,
        })),
      })),
    },
    purchaseOrderItem: {
      update: jest.fn(async ({ where, data }: any) => {
        const item = items.find((row) => row.id === where.id)!;
        item.receivedQuantity = item.receivedQuantity.plus(data.receivedQuantity.increment);
        if (data.supplyPrice) item.supplyPrice = data.supplyPrice;
        return item;
      }),
      findMany: jest.fn(async () => items),
    },
    supplier: { findFirst: jest.fn(async () => ({ id: 3, isActive: true })) },
    shop: { findFirst: jest.fn(async () => ({ id: 'shop-1' })) },
    product: {
      findFirst: jest.fn(async () => ({ id: 10, purchasePrice: 90, salePrice: 150 })),
      findMany: jest.fn(async () => [
        { id: 10, name: 'Футболка', sku: 'T-1', barcode: '200', purchasePrice: 90 },
      ]),
      update: jest.fn(),
    },
    productVariant: { findMany: jest.fn(async () => []) },
    company: { findUnique: jest.fn(async () => ({ supplyPriceStrategy: 'LAST_PURCHASE' })) },
    productStock: {
      findFirst: jest.fn(async () => ({ quantity: 0, purchasePrice: 90 })),
      updateMany: jest.fn(),
      findMany: jest.fn(async () => [{ quantity: 4, purchasePrice: 120 }]),
    },
    productVariantStock: { updateMany: jest.fn() },
    stockMovement: { create: stockMovementCreate },
    productSupplyPriceHistory: { create: jest.fn() },
    productSupplier: { upsert: supplierUpsert },
    auditLog: { create: auditCreate },
    user: { findMany: jest.fn(async () => []) },
  };
  db.$transaction = jest.fn((operation: any) => operation(db));
  const service = new PurchaseOrdersService(db);
  return { service, db, order, items, stockMovementCreate, supplierUpsert };
}

describe('PurchaseOrdersService', () => {
  beforeEach(() => jest.clearAllMocks());

  it('creates a draft with snapshotted positions and refuses an empty order', async () => {
    const { service, db } = setup();
    await expect(
      service.create({ supplier_id: 3, shop_id: 'shop-1', items: [] }, testContext()),
    ).rejects.toThrow('Добавьте хотя бы один товар');

    const created = await service.create(
      { supplier_id: 3, shop_id: 'shop-1', items: [{ product_id: 10, quantity: 5 }] },
      testContext(),
    );
    expect(created.status).toBe('DRAFT');
    expect(db.purchaseOrder.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          supplierId: 3,
          shopId: 'shop-1',
          createdById: 7,
          items: {
            create: [
              expect.objectContaining({
                productId: 10,
                name: 'Футболка',
                quantity: new Prisma.Decimal(5),
                // No price given: the current supply price is planned.
                supplyPrice: new Prisma.Decimal(90),
              }),
            ],
          },
        }),
      }),
    );
  });

  it('refuses a shop the user has no access to', async () => {
    const { service } = setup();
    await expect(
      service.create(
        { supplier_id: 3, shop_id: 'shop-9', items: [{ product_id: 10, quantity: 1 }] },
        testContext(),
      ),
    ).rejects.toThrow('Нет доступа');
  });

  it('cannot receive a draft before it is sent', async () => {
    const { service } = setup('DRAFT');
    await expect(service.receive('po-1', {}, testContext())).rejects.toThrow('Сначала отправьте');
  });

  it('receives in parts, posts stock and becomes RECEIVED when everything arrived', async () => {
    const { service, order, items, stockMovementCreate, supplierUpsert } = setup();

    const partial = await service.receive(
      'po-1',
      { items: [{ item_id: 'i-1', quantity: 4, supply_price: 110 }] },
      testContext(),
    );
    expect(order.status).toBe('PARTIAL');
    expect(partial.items[0].received_quantity).toBe(4);
    expect(moveVariantStock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ shopId: 'shop-1', branchCode: 'B1', productId: 10, delta: 4 }),
    );
    expect(stockMovementCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'PURCHASE',
        displayTypeCode: 'purchase_order',
        externalId: 'po-1',
        quantity: 4,
        supplyPrice: 110,
      }),
    });
    expect(items[0].supplyPrice.toNumber()).toBe(110);
    expect(supplierUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { productId: 10, supplierId: 3 } }),
    );

    await expect(
      service.receive('po-1', { items: [{ item_id: 'i-1', quantity: 7 }] }, testContext()),
    ).rejects.toThrow('больше, чем осталось');

    // No items: everything that is still missing.
    await service.receive('po-1', {}, testContext());
    expect(order.status).toBe('RECEIVED');
    expect(items[0].receivedQuantity.toNumber()).toBe(10);
    expect(moveVariantStock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ delta: 6 }),
    );
  });

  it('cancels only with a reason and only before goods arrived', async () => {
    const { service, order } = setup();
    await expect(service.cancel('po-1', {}, testContext())).rejects.toThrow('причину');
    await service.cancel('po-1', { reason: 'Поставщик не может отгрузить' }, testContext());
    expect(order.status).toBe('CANCELLED');
    expect(order.cancelReason).toBe('Поставщик не может отгрузить');

    const partial = setup('PARTIAL');
    await expect(
      partial.service.cancel('po-1', { reason: 'Передумали' }, testContext()),
    ).rejects.toThrow('отменить нельзя');
    await partial.service.close('po-1', testContext());
    expect(partial.order.status).toBe('RECEIVED');
  });
});
