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

  it('keeps colourless rows of one article/size apart by their barcode', async () => {
    const rows = await (buildService() as any).normalizeApparelImportRows(
      'company-1',
      [
        makeRow({ colorCode: '', barcode: '111' }),
        makeRow({ colorCode: '', barcode: '222' }),
      ],
    );

    expect(rows).toHaveLength(2);
  });
});

describe('ProductsService import colours from the catalog', () => {
  const variant = (color: string | null, size: string | null) => ({
    color: color ? { code: color } : null,
    size: size ? { code: size } : null,
    product: { article: 'TS-1' },
  });

  const buildService = (prisma: {
    findFirst?: jest.Mock;
    findMany?: jest.Mock;
  }) =>
    new ProductsService(
      {
        company: {
          findUnique: jest.fn().mockResolvedValue({ storeType: 'CLOTHING' }),
        },
        productVariant: {
          findFirst: prisma.findFirst ?? jest.fn().mockResolvedValue(null),
          findMany: prisma.findMany ?? jest.fn().mockResolvedValue([]),
        },
        productColor: {
          findFirst: jest.fn(({ where }) =>
            Promise.resolve(
              ['BLK', 'WHT', 'NVY'].includes(where.code)
                ? { id: `color-${where.code}`, code: where.code }
                : null,
            ),
          ),
          // The company's colours; findImportColor compares them itself.
          findMany: jest.fn(() =>
            Promise.resolve([
              { id: 'color-BLK', code: 'BLK', name: 'Чёрный', nameRu: 'Чёрный', nameUz: 'Qora', hex: '#000000' },
              { id: 'color-NVY', code: 'NVY', name: 'Тёмно-синий', nameRu: 'Тёмно-синий', nameUz: null, hex: '#1F2A44' },
            ]),
          ),
        },
        productSize: {
          findFirst: jest
            .fn()
            .mockResolvedValue({ id: 'size-1', kind: 'CLOTHING' }),
        },
      } as any,
      {} as any,
    ) as any;

  const row = (overrides: Record<string, unknown> = {}) => ({
    name: 'Футболка',
    article: 'TS-1',
    quantity: 1,
    supplyPrice: 50,
    retailPrice: 100,
    ...overrides,
  });

  it('takes colour, size and article of an existing variant found by barcode', async () => {
    const service = buildService({
      findFirst: jest.fn().mockResolvedValue(variant('BLK', 'M')),
    });
    const input = row({ article: undefined, barcode: '4600000000017' });

    const warnings = await service.validateImportReferences('company-1', input);

    expect(warnings).toEqual([]);
    expect(input).toMatchObject({
      article: 'TS-1',
      colorCode: 'BLK',
      sizeName: 'M',
    });
  });

  it('accepts a colour written by its name', async () => {
    const service = buildService({});
    const input = row({ colorCode: 'Чёрный', sizeName: 'M' });

    await service.validateImportReferences('company-1', input);

    expect(input).toMatchObject({ colorCode: 'BLK', colorName: 'BLK' });
  });

  it.each([
    ['чёрный', 'BLK'],
    ['#000', 'BLK'],
    ['Темно синий', 'NVY'],
    ['#1f2a44', 'NVY'],
  ])('accepts the colour %p written another way', async (value, code) => {
    const service = buildService({});
    const input = row({ colorCode: value, sizeName: 'M' });

    await service.validateImportReferences('company-1', input);

    expect(input).toMatchObject({ colorCode: code });
  });

  it('takes the only colour an existing article has', async () => {
    const service = buildService({
      findMany: jest
        .fn()
        .mockResolvedValue([variant('BLK', 'M'), variant('BLK', 'L')]),
    });
    const input = row({ sizeName: 'XL' });

    await service.validateImportReferences('company-1', input);

    expect(input).toMatchObject({ colorCode: 'BLK', sizeName: 'XL' });
  });

  it('still requires a colour when the article has several in the catalog', async () => {
    const service = buildService({
      findMany: jest
        .fn()
        .mockResolvedValue([variant('BLK', 'M'), variant('WHT', 'M')]),
    });

    await expect(
      service.validateImportReferences('company-1', row({ sizeName: 'M' })),
    ).rejects.toThrow('несколько цветов (BLK, WHT)');
  });

  it('drops a variant SKU that only repeats the model article', () => {
    const service = buildService({});

    expect(
      service.resolveImportVariantSku(row({ sku: ' ts-1 ', article: 'TS-1' })),
    ).toBeNull();
    expect(service.resolveImportVariantSku(row({ sku: 'TS-1-BLK-M' }))).toBe(
      'TS-1-BLK-M',
    );
  });

  it('does not look up the no-season marker in the season dictionary', async () => {
    const service = buildService({});
    const input = row({
      colorCode: 'BLK',
      sizeName: 'M',
      seasonCode: 'NO_SEASON',
    });

    await expect(
      service.validateImportReferences('company-1', input),
    ).resolves.toEqual([]);
  });

  it('skips the season check for a row that matches an existing variant', async () => {
    const service = buildService({
      findFirst: jest.fn().mockResolvedValue(variant('BLK', 'M')),
    });
    const input = row({ barcode: '111', seasonCode: 'UNKNOWN' });

    await expect(
      service.validateImportReferences('company-1', input),
    ).resolves.toEqual([]);
  });

  it('still rejects an unknown season on a new product', async () => {
    const service = buildService({});
    service.prisma.productSeasonOption = {
      findFirst: jest.fn().mockResolvedValue(null),
    };

    await expect(
      service.validateImportReferences(
        'company-1',
        row({ colorCode: 'BLK', sizeName: 'M', seasonCode: 'UNKNOWN' }),
      ),
    ).rejects.toThrow('Сезон «UNKNOWN» не найден');
  });

  it('finds a dictionary season written by its name and links it by code', async () => {
    const service = buildService({});
    const findFirst = jest.fn().mockResolvedValue({ id: 'season-1', code: 'LETO2026' });
    service.prisma.productSeasonOption = { findFirst };
    const input = row({ colorCode: 'BLK', sizeName: 'M', seasonCode: 'Лето 2026' });

    await expect(service.validateImportReferences('company-1', input)).resolves.toEqual([]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ nameRu: { equals: 'Лето 2026', mode: 'insensitive' } }]),
        }),
      }),
    );
    expect((input as { seasonCode?: string }).seasonCode).toBe('LETO2026');
  });

  it('still requires a colour for a new product', async () => {
    const service = buildService({});

    await expect(
      service.validateImportReferences('company-1', row({ sizeName: 'M' })),
    ).rejects.toThrow('Не указан код цвета');
  });

  it('warns without blocking when the file colour differs from the catalog', async () => {
    const service = buildService({
      findFirst: jest.fn().mockResolvedValue(variant('BLK', 'M')),
    });
    const input = row({ barcode: '111', colorCode: 'WHT', sizeName: 'M' });

    const warnings = await service.validateImportReferences('company-1', input);

    expect(warnings).toEqual([
      expect.stringContaining('отличается от цвета в базе (BLK)'),
    ]);
    expect(input).toMatchObject({ colorCode: 'WHT', storeColorCode: 'BLK' });
    expect(
      service.collectDifferentFields(
        { stocks: [], suppliers: [], name: 'Футболка', supplyPrice: 0 },
        input,
        'B1',
      ),
    ).toContain('color');
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

describe('Excel import variant grouping', () => {
  const baseRow = {
    quantity: 1,
    supplyPrice: 1,
    retailPrice: 2,
  };

  it('matches an identifier-less colour/size row to the variative product of the same company and name', async () => {
    const prisma = {
      product: { findFirst: jest.fn().mockResolvedValue({ id: 7 }) },
    };
    const service = new ProductsService(prisma as any, {} as any);

    const matched = await (service as any).findImportMatchedProduct(
      'company-1',
      {
        ...baseRow,
        name: 'Nike Hoodie',
        colorName: 'Black',
        sizeName: 'M',
      },
    );

    expect(matched).toEqual({ id: 7 });
    expect(prisma.product.findFirst.mock.calls[0][0].where).toMatchObject({
      companyId: 'company-1',
      variantType: 'variative',
      name: { equals: 'Nike Hoodie', mode: 'insensitive' },
    });
  });

  it('does not merge plain rows by name alone', async () => {
    const prisma = { product: { findFirst: jest.fn() } };
    const service = new ProductsService(prisma as any, {} as any);

    await expect(
      (service as any).findImportMatchedProduct('company-1', {
        ...baseRow,
        name: 'Nike Hoodie',
      }),
    ).resolves.toBeNull();
    expect(prisma.product.findFirst).not.toHaveBeenCalled();
  });

  it.each([
    ['Winter', 'AW'],
    ['Зима', 'AW'],
    ['Summer', 'SS'],
    ['Лето', 'SS'],
    ['LETO2026', 'SS'],
    ['Осень-зима', 'AW'],
    ['Демисезон', 'NO_SEASON'],
    ['SPECIAL', 'NO_SEASON'],
  ])('maps season %s to %s', (input, expected) => {
    const service = new ProductsService({} as any, {} as any);
    expect((service as any).resolveProductSeason(input)).toBe(expected);
  });
});
