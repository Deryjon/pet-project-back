import { companyContext as testContext } from '../../test/fixtures/request-context';
import { WarehouseService } from './warehouse.service';

describe('Warehouse inventory security and workflow', () => {
  let db: any;
  let service: WarehouseService;
  const context = (extra: object = {}) => testContext({ companyId: 'own', userId: 1, allowedShopIds: ['allowed'], crmRoleName: 'Админ', ...extra });

  beforeEach(() => {
    db = {
      inventorySession: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      inventoryItem: { findFirst: jest.fn(), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn(), update: jest.fn() },
      inventoryCountAttempt: { findMany: jest.fn(), updateMany: jest.fn(), create: jest.fn() },
      product: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
      productStock: { findUnique: jest.fn(), upsert: jest.fn(), aggregate: jest.fn() },
      productVariantStock: { findUnique: jest.fn(), upsert: jest.fn(), aggregate: jest.fn() },
      productVariant: { findMany: jest.fn() }, shop: { findFirst: jest.fn() }, auditLog: { create: jest.fn().mockResolvedValue({}) },
      stockMovement: { fields: { fromRetailPrice: 'field' }, findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn(), create: jest.fn() },
      $transaction: jest.fn((op: any) => typeof op === 'function' ? op(db) : Promise.all(op)),
    };
    service = new WarehouseService(db);
  });

  it.each(['getInventorySession', 'approveInventory'] as const)('scopes %s by company and allowed shops', async (method) => {
    db.inventorySession.findFirst.mockResolvedValue(null);
    await expect(service[method]('foreign', context())).rejects.toThrow();
    expect(db.inventorySession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign', companyId: 'own', shopId: { in: ['allowed'] } } }));
  });

  it('rejects creation for an inaccessible shop', async () => {
    await expect(service.createInventorySession({ shop_id: 'foreign' }, context())).rejects.toThrow('Shop is not available');
    expect(db.inventorySession.create).not.toHaveBeenCalled();
  });

  it('hides system values in blind counting from a seller', async () => {
    db.inventorySession.findFirst.mockResolvedValue({ id: 'i', countMode: 'BLIND', status: 'COUNTING', responsibleUserIds: [1], shop: {}, createdBy: {}, items: [{ id: 'x', productId: 1, product: { name: 'P' }, status: 'NOT_COUNTED', systemQuantitySnapshot: 9, version: 0 }] });
    const result: any = await service.getInventorySession('i', context({ crmRoleName: 'Продавец' }));
    expect(result.blind).toBe(true);
    expect(result.items[0].systemQuantitySnapshot).toBeUndefined();
  });

  it('does not silently treat uncounted positions as zero', async () => {
    db.inventorySession.findFirst.mockResolvedValue({ id: 'i', status: 'COUNTING' }); db.inventoryItem.count.mockResolvedValue(1);
    await expect(service.submitInventory('i', context())).rejects.toThrow('All positions must be counted');
    expect(db.inventorySession.update).not.toHaveBeenCalled();
  });

  it('makes repeated approval idempotent', async () => {
    db.inventorySession.findFirst.mockResolvedValue({ id: 'i', status: 'COMPLETED', items: [], shop: {} });
    await expect(service.approveInventory('i', context())).resolves.toEqual({ success: true, id: 'i', status: 'COMPLETED', idempotent: true });
    expect(db.stockMovement.create).not.toHaveBeenCalled();
  });

  it('rejects final approval by a seller', async () => {
    await expect(service.approveInventory('i', context({ crmRoleName: 'Продавец' }))).rejects.toThrow('Only Admin or Store Manager');
    expect(db.inventorySession.findFirst).not.toHaveBeenCalled();
  });

  it('rejects an unassigned seller before exposing inventory data', async () => {
    db.inventorySession.findFirst.mockResolvedValue({ id: 'i', countMode: 'BLIND', status: 'COUNTING', responsibleUserIds: [999], shop: {}, createdBy: {}, items: [] });
    await expect(service.getInventorySession('i', context({ crmRoleName: 'Продавец' }))).rejects.toThrow('You are not assigned');
  });
});
