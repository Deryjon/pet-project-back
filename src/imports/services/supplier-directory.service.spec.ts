import { companyContext as testContext } from '../../../test/fixtures/request-context';
import { ImportNormalizerService } from './import-normalizer.service';
import { SupplierDirectoryService } from './supplier-directory.service';

describe('Supplier alias company isolation', () => {
  it('rejects a foreign product before changing the alias', async () => {
    const db = {
      supplierProductAlias: {
        findFirst: jest.fn().mockResolvedValue({ id: 'alias' }),
        update: jest.fn(),
      },
      product: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = new SupplierDirectoryService(
      db as any,
      new ImportNormalizerService(),
    );
    await expect(
      service.updateAlias(
        1,
        'alias',
        { productId: 99 },
        testContext({ companyId: 'own' }),
      ),
    ).rejects.toThrow('Product not found');
    expect(db.product.findFirst).toHaveBeenCalledWith({
      where: { id: 99, companyId: 'own' },
      select: { id: true },
    });
    expect(db.supplierProductAlias.update).not.toHaveBeenCalled();
  });
  it('allows updating an alias to a product in the same company', async () => {
    const db = {
      supplierProductAlias: {
        findFirst: jest.fn().mockResolvedValue({ id: 'alias' }),
        update: jest.fn().mockResolvedValue({ id: 'alias', productId: 2 }),
      },
      product: { findFirst: jest.fn().mockResolvedValue({ id: 2 }) },
    };
    const service = new SupplierDirectoryService(
      db as any,
      new ImportNormalizerService(),
    );
    await expect(
      service.updateAlias(
        1,
        'alias',
        { productId: 2 },
        testContext({ companyId: 'own' }),
      ),
    ).resolves.toMatchObject({ productId: 2 });
  });
});
