import { companyContext as testContext } from '../../test/fixtures/request-context';
import { WarehouseService } from './warehouse.service';

describe('Warehouse company and shop isolation', () => {
  let db: any;
  let service: WarehouseService;
  beforeEach(() => {
    db = {
      inventorySession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        updateMany: jest.fn(),
      },
      inventoryItem: { upsert: jest.fn() },
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        update: jest.fn(),
      },
      productStock: {
        findMany: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
      },
      stockMovement: {
        fields: { fromRetailPrice: 'fromRetailPriceField' },
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
      },
      $transaction: jest.fn((operation) => operation(db)),
    };
    service = new WarehouseService(db);
  });
  it.each(['getInventorySession', 'applyInventory'] as const)(
    'scopes %s to company and allowed shops',
    async (method) => {
      await expect(
        service[method](
          'foreign',
          testContext({
            companyId: 'own',
            userId: 1,
            allowedShopIds: ['allowed'],
          }),
        ),
      ).rejects.toThrow();
      expect(db.inventorySession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'foreign',
            companyId: 'own',
            shopId: { in: ['allowed'] },
          },
        }),
      );
      expect(db.productStock.findMany).not.toHaveBeenCalled();
    },
  );
  it('rejects adding to an inaccessible inventory session', async () => {
    await expect(
      service.addInventoryItem(
        'foreign',
        { product_id: 1, actual_quantity: 2 },
        testContext({
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
      ),
    ).rejects.toThrow('Session not found');
    expect(db.inventoryItem.upsert).not.toHaveBeenCalled();
  });
  it('rejects creating inventory for an unavailable shop', async () => {
    await expect(
      service.createInventorySession(
        { shop_id: 'foreign' },
        testContext({
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
      ),
    ).rejects.toThrow('Shop is not available');
    expect(db.inventorySession.create).not.toHaveBeenCalled();
  });
  it.each([-1, NaN, Infinity])(
    'rejects invalid actual quantity %s',
    async (actual_quantity) => {
      db.inventorySession.findFirst.mockResolvedValue({ status: 'draft' });
      await expect(
        service.addInventoryItem(
          'own',
          { product_id: 1, actual_quantity },
          testContext({
            companyId: 'own',
            userId: 1,
            allowedShopIds: ['allowed'],
          }),
        ),
      ).rejects.toThrow('actual_quantity is invalid');
      expect(db.inventoryItem.upsert).not.toHaveBeenCalled();
    },
  );
  it('rejects products outside the company', async () => {
    db.inventorySession.findFirst.mockResolvedValue({ status: 'draft' });
    await expect(
      service.addInventoryItem(
        'own',
        { product_id: 99, actual_quantity: 2 },
        testContext({
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
      ),
    ).rejects.toThrow('Product not found');
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: { id: 99, companyId: 'own', archivedAt: null },
      select: { id: true },
    });
    expect(db.inventoryItem.upsert).not.toHaveBeenCalled();
  });
  it('limits movement lists to accessible shops', async () => {
    await service.listMovements(
      'PURCHASE',
      {},
      testContext({ companyId: 'own', userId: 1, allowedShopIds: ['allowed'] }),
    );
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          type: 'PURCHASE',
          companyId: 'own',
          shopId: { in: ['allowed'] },
        },
      }),
    );
  });
  it('does not remove filtering for a user with no shops', async () => {
    const noShops = new WarehouseService(db);
    await noShops.listMovements(
      'PURCHASE',
      {},
      testContext({ companyId: 'own', allowedShopIds: [] }),
    );
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'PURCHASE', companyId: 'own', shopId: { in: [] } },
      }),
    );
  });

  it('filters revaluations before pagination and uses the same predicate for total', async () => {
    await service.listRevaluations(
      {},
      testContext({ companyId: 'own', userId: 1, allowedShopIds: ['allowed'] }),
    );
    const expectedWhere = {
      companyId: 'own',
      shopId: { in: ['allowed'] },
      newRetailPrice: { not: 'fromRetailPriceField' },
    };
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expectedWhere }),
    );
    expect(db.stockMovement.count).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('creates a missing stock row and records one inventory adjustment', async () => {
    db.inventorySession.findFirst.mockResolvedValue({
      id: 'inventory-1',
      companyId: 'own',
      shopId: 'allowed',
      status: 'draft',
      shop: { branchCode: '001' },
      items: [{ productId: 10, actualQuantity: 7 }],
    });
    db.inventorySession.updateMany.mockResolvedValue({ count: 1 });
    db.product.findFirst.mockResolvedValue({ id: 10 });
    db.productStock.findMany.mockResolvedValue([]);
    db.productStock.aggregate.mockResolvedValue({ _sum: { quantity: 7 } });
    db.stockMovement.create.mockResolvedValue({ id: 'movement-1' });

    await expect(
      service.applyInventory(
        'inventory-1',
        testContext({
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
      ),
    ).resolves.toEqual({
      success: true,
      id: 'inventory-1',
      status: 'completed',
    });

    expect(db.productStock.create).toHaveBeenCalledWith({
      data: {
        productId: 10,
        shopId: 'allowed',
        branchCode: '001',
        quantity: 7,
      },
    });
    expect(db.stockMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        companyId: 'own',
        shopId: 'allowed',
        productId: 10,
        type: 'ADJUSTMENT',
        externalId: 'inventory-1',
        createdById: 1,
      }),
    });
    expect(db.inventorySession.updateMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({ status: 'applying' }),
        data: expect.objectContaining({ status: 'completed' }),
      }),
    );
  });

  it('does not write stock when another request already claimed the session', async () => {
    db.inventorySession.findFirst.mockResolvedValue({
      id: 'inventory-1',
      companyId: 'own',
      shopId: 'allowed',
      status: 'draft',
      shop: { branchCode: '001' },
      items: [{ productId: 10, actualQuantity: 7 }],
    });
    db.inventorySession.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      service.applyInventory(
        'inventory-1',
        testContext({
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
      ),
    ).rejects.toThrow('already being applied');
    expect(db.productStock.findMany).not.toHaveBeenCalled();
    expect(db.stockMovement.create).not.toHaveBeenCalled();
  });
});
