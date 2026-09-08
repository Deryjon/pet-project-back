import { WarehouseService } from './warehouse.service';

describe('Warehouse company and shop isolation', () => {
  let db: any;
  let service: WarehouseService;
  beforeEach(() => {
    db = {
      inventorySession: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
      },
      inventoryItem: { upsert: jest.fn() },
      product: { findFirst: jest.fn().mockResolvedValue(null) },
      stockMovement: {
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn(),
    };
    service = new WarehouseService(db, {
      getRequestContext: jest
        .fn()
        .mockResolvedValue({
          userType: 'company',
          companyId: 'own',
          userId: 1,
          allowedShopIds: ['allowed'],
        }),
    } as any);
  });
  it.each(['getInventorySession', 'applyInventory'] as const)(
    'scopes %s to company and allowed shops',
    async (method) => {
      await expect(service[method]('foreign', 'Bearer test')).rejects.toThrow();
      expect(db.inventorySession.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: 'foreign',
            companyId: 'own',
            shopId: { in: ['allowed'] },
          },
        }),
      );
      expect(db.$transaction).not.toHaveBeenCalled();
    },
  );
  it('rejects adding to an inaccessible inventory session', async () => {
    await expect(
      service.addInventoryItem(
        'foreign',
        { product_id: 1, actual_quantity: 2 },
        'Bearer test',
      ),
    ).rejects.toThrow('Session not found');
    expect(db.inventoryItem.upsert).not.toHaveBeenCalled();
  });
  it('rejects creating inventory for an unavailable shop', async () => {
    await expect(
      service.createInventorySession({ shop_id: 'foreign' }, 'Bearer test'),
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
          'Bearer test',
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
        'Bearer test',
      ),
    ).rejects.toThrow('Product not found');
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: { id: 99, companyId: 'own', archivedAt: null },
      select: { id: true },
    });
    expect(db.inventoryItem.upsert).not.toHaveBeenCalled();
  });
  it('limits movement lists to accessible shops', async () => {
    await service.listMovements('PURCHASE', {}, 'Bearer test');
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
    const noShops = new WarehouseService(db, {
      getRequestContext: async () => ({
        userType: 'company',
        companyId: 'own',
        allowedShopIds: [],
      }),
    } as any);
    await noShops.listMovements('PURCHASE', {}, 'Bearer test');
    expect(db.stockMovement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { type: 'PURCHASE', companyId: 'own', shopId: { in: [] } },
      }),
    );
  });
});
