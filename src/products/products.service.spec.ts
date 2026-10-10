import { CompanyRequestContext } from '../auth/request-context';
import { ProductsService } from './products.service';

const companyContext: CompanyRequestContext = {
  userId: 1,
  fullName: 'Catalog user',
  userType: 'company',
  role: 'role-1',
  crmRoleId: 'role-1',
  crmRoleName: 'Manager',
  companyId: 'company-1',
  currentShopId: 'shop-1',
  currentBranchCode: 'B1',
  allowedShopIds: ['shop-1'],
  allowedBranchCodes: ['B1'],
  canSwitchShops: false,
};

describe('ProductsService product type compatibility', () => {
  const service = new ProductsService({} as any, {} as any);

  it.each([
    ['goods', '69e939aa-9b8f-46a9-b605-8b2675475b7b'],
    ['service', 'f3e4d8de-5d2c-4ff0-b1c2-5ed0f7a27401'],
    ['bundle', '85a7f6a9-0737-4f7e-a1a5-9d5f8f27d2f4'],
    ['kit', '85a7f6a9-0737-4f7e-a1a5-9d5f8f27d2f4'],
  ])('maps API product type %s to its persisted type id', (input, expected) => {
    expect((service as any).resolveProductType(input)).toBe(expected);
  });
});

describe('ProductsService identifier generation', () => {
  const buildService = () => {
    const prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      productVariant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    const service = new ProductsService(prisma as any, {} as any);

    return { prisma, service };
  };

  it('generates the next company-scoped sku sequentially', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([
      { sku: 'SKU-00010' },
      { sku: 'SKU-00002' },
      { sku: 'SKU-BAD' },
    ]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateSku({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      sku: 'SKU-00011',
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        sku: 'SKU-00011',
      },
      select: { id: true },
    });
  });

  it('generates a valid EAN13 barcode with check digit', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([{ barcode: '2000000000008' }]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateBarcode({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      barcode: '2000000000015',
    });
  });

  it('ignores existing invalid EAN13 barcodes when choosing the next barcode', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([{ barcode: '2000000000000' }]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateBarcode({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      barcode: '2000000000008',
    });
  });

  it('allocates import identifiers through the active transaction', async () => {
    const rootPrisma = {
      product: {
        findMany: jest.fn().mockRejectedValue(new Error('root client used')),
        findFirst: jest.fn().mockRejectedValue(new Error('root client used')),
      },
      productVariant: {
        findFirst: jest.fn().mockRejectedValue(new Error('root client used')),
      },
    };
    const tx = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      productVariant: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new ProductsService(rootPrisma as any, {} as any);

    await expect(
      (service as any).resolveIdentifiersForImportCreate(
        { name: 'Футболка', quantity: 1, supplyPrice: 1, retailPrice: 2 },
        'company-1',
        tx,
      ),
    ).resolves.toMatchObject({
      sku: expect.stringMatching(/-\d{5}$/),
      barcode: expect.stringMatching(/^2\d{12}$/),
    });
    expect(rootPrisma.product.findMany).not.toHaveBeenCalled();
    expect(tx.product.findMany).toHaveBeenCalled();
    expect(tx.productVariant.findFirst).toHaveBeenCalled();
  });
});

describe('ProductsService apparel import grouping', () => {
  const makeRow = (overrides: Record<string, unknown> = {}) => ({
    name: 'Футболка',
    article: 'TS-1',
    colorCode: 'BLK',
    sizeName: 'm',
    seasonCode: 'SUMMER',
    quantity: 2,
    supplyPrice: 50,
    retailPrice: 100,
    ...overrides,
  });

  const buildService = () =>
    new ProductsService(
      {
        company: {
          findUnique: jest.fn().mockResolvedValue({ storeType: 'CLOTHING' }),
        },
      } as any,
      {} as any,
    );

  it('sums duplicate article/color/size combinations and adds a warning', async () => {
    const rows = await (buildService() as any).normalizeApparelImportRows(
      'company-1',
      [makeRow(), makeRow({ quantity: 3, sizeName: ' M ' })],
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      quantity: 5,
      colorCode: 'BLK',
      sizeName: 'M',
    });
    expect(rows[0].warnings).toEqual([
      expect.stringContaining('количество из строки 2 суммировано'),
    ]);
  });

  it('rejects conflicting product facts within one article group', async () => {
    await expect(
      (buildService() as any).normalizeApparelImportRows('company-1', [
        makeRow(),
        makeRow({ name: 'Другая футболка', colorCode: 'WHT' }),
      ]),
    ).rejects.toThrow('различаются название или сезон');
  });
});
describe('Legacy product creation authorization', () => {
  it('rejects calls without authorization before writing a product', async () => {
    const prisma = { product: { create: jest.fn() } };
    const service = new ProductsService(prisma as any, {} as any);
    await expect(
      service.create(
        { name: 'Cable', company_id: 'foreign' },
        undefined as any,
      ),
    ).rejects.toThrow('Only company users');
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('uses the authenticated company even when the request supplies another ID', async () => {
    const prisma = {
      product: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new ProductsService(prisma as any, {} as any);
    jest
      .spyOn(service as any, 'toProductResponse')
      .mockImplementation((value) => value);
    await service.create(
      { name: 'Cable', company_id: 'foreign' },
      { ...companyContext, companyId: 'own' },
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ company: { connect: { id: 'own' } } }),
    });
  });
});

describe('Product attribute safety', () => {
  it('does not delete a color referenced by a product variant', async () => {
    const prisma = {
      productColor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'color-1' }),
        delete: jest.fn(),
      },
      productVariant: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new ProductsService(prisma as any, {} as any);

    await expect(
      service.deleteProductColor('color-1', companyContext),
    ).rejects.toThrow('Нельзя удалить цвет');
    expect(prisma.productColor.delete).not.toHaveBeenCalled();
  });

  it('does not delete a size referenced by a product variant', async () => {
    const prisma = {
      productSize: {
        findFirst: jest.fn().mockResolvedValue({ id: 'size-1' }),
        delete: jest.fn(),
      },
      productVariant: { count: jest.fn().mockResolvedValue(1) },
    };
    const service = new ProductsService(prisma as any, {} as any);

    await expect(
      service.deleteProductSize('size-1', companyContext),
    ).rejects.toThrow('Нельзя удалить размер');
    expect(prisma.productSize.delete).not.toHaveBeenCalled();
  });
});

describe('Catalog deletion safety', () => {
  it('never deletes operational history when a product has movements', async () => {
    const tx = {
      product: {
        count: jest.fn().mockResolvedValue(1),
        deleteMany: jest.fn(),
      },
      saleItem: { updateMany: jest.fn() },
      orderItem: { deleteMany: jest.fn() },
      stockMovement: { deleteMany: jest.fn() },
      transferItem: { deleteMany: jest.fn() },
      productSupplier: { deleteMany: jest.fn() },
      productStock: { deleteMany: jest.fn() },
      productSupplyPriceHistory: { deleteMany: jest.fn() },
    };
    const prisma = {
      $transaction: jest.fn((callback: any) => callback(tx)),
    };
    const service = new ProductsService(prisma as any, {} as any);

    await expect(
      (service as any).deleteProductsByInternalIds([10], 'company-1'),
    ).rejects.toThrow('Товар нельзя удалить');
    expect(tx.product.deleteMany).not.toHaveBeenCalled();
    expect(tx.stockMovement.deleteMany).not.toHaveBeenCalled();
    expect(tx.orderItem.deleteMany).not.toHaveBeenCalled();
  });
});
