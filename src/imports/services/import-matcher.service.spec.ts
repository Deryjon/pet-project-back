import { companyContext as testContext } from '../../../test/fixtures/request-context';
import { ImportMatcherService } from './import-matcher.service';
import { ImportNormalizerService } from './import-normalizer.service';
import { SupplierInvoiceService } from './supplier-invoice.service';

describe('Import matching', () => {
  const normalizer = new ImportNormalizerService();
  let db: any;
  let matcher: ImportMatcherService;
  beforeEach(() => {
    db = {
      product: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
      },
      supplierProductAlias: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn(),
      },
      supplierInvoiceItem: {
        update: jest
          .fn()
          .mockImplementation(({ data }) => Promise.resolve(data)),
      },
    };
    matcher = new ImportMatcherService(db, normalizer);
  });
  it.each([
    ['unique', 'unrelated', null],
    ['alpha beta gamma', 'alpha delta epsilon', null],
    ['alpha beta', 'alpha gamma', 50],
    ['alpha beta', 'alpha beta', 100],
    ['!!!', '???', null],
  ])(
    'matches %s against %s with confidence %s',
    async (rawName, name, confidence) => {
      db.product.findMany.mockResolvedValue([{ id: 1, name }]);
      const result = await matcher.match('company', 1, { rawName });
      if (confidence === null) expect(result).toBeNull();
      else expect(result).toMatchObject({ confidence, method: 'FUZZY_NAME' });
    },
  );
  it('returns null for an empty catalog', async () => {
    expect(await matcher.match('company', 1, { rawName: 'alpha' })).toBeNull();
  });
  it('selects the strongest candidate', async () => {
    db.product.findMany.mockResolvedValue([
      { id: 1, name: 'unrelated' },
      { id: 2, name: 'alpha beta' },
    ]);
    expect(
      await matcher.match('company', 1, { rawName: 'alpha beta' }),
    ).toMatchObject({ product: { id: 2 }, confidence: 100 });
  });
  it.each([501, 1001])(
    'finds the best match at catalog position %s',
    async (position) => {
      const catalog = Array.from({ length: position }, (_, index) => ({
        id: index + 1,
        name: index === position - 1 ? 'alpha beta' : 'alpha gamma',
        companyId: 'company',
        archivedAt: null,
      }));
      db.product.findMany.mockImplementation(
        async ({ where, take, orderBy }) => {
          expect(where.companyId).toBe('company');
          expect(where.archivedAt).toBeNull();
          expect(orderBy).toEqual({ id: 'asc' });
          return catalog
            .filter((product) => product.id > (where.id?.gt ?? 0))
            .slice(0, take);
        },
      );
      expect(
        await matcher.match('company', 1, { rawName: 'alpha beta' }),
      ).toMatchObject({
        product: { id: position },
        confidence: 100,
      });
      expect(db.product.findMany).toHaveBeenCalledTimes(
        Math.ceil(position / 500),
      );
    },
  );
  it('terminates after a full final batch with no suitable match', async () => {
    db.product.findMany
      .mockResolvedValueOnce(
        Array.from({ length: 500 }, (_, index) => ({
          id: index + 1,
          name: 'unrelated',
        })),
      )
      .mockResolvedValueOnce([]);
    expect(await matcher.match('company', 1, { rawName: 'unique' })).toBeNull();
    expect(db.product.findMany).toHaveBeenLastCalledWith({
      where: { companyId: 'company', archivedAt: null, id: { gt: 500 } },
      orderBy: { id: 'asc' },
      take: 500,
    });
  });
  it('preserves exact barcode matches with unrelated names', async () => {
    db.product.findFirst.mockResolvedValue({ id: 1, name: 'unrelated' });
    expect(
      await matcher.match('company', 1, {
        rawName: 'unique',
        rawBarcode: '123',
      }),
    ).toMatchObject({ method: 'BARCODE', confidence: 100 });
  });
  it('preserves supplier SKU matches with unrelated names', async () => {
    db.supplierProductAlias.findMany.mockResolvedValue([
      { id: 1, supplierSku: 'sku', product: { id: 1, name: 'unrelated' } },
    ]);
    expect(
      await matcher.match('company', 1, { rawName: 'unique', rawSku: 'sku' }),
    ).toMatchObject({ method: 'SUPPLIER_SKU', confidence: 100 });
  });
  it('prefers an exact supplier SKU over a conflicting name alias', async () => {
    db.supplierProductAlias.findMany.mockImplementation(async ({ where }) => {
      if (where.supplierSku === 'sku-1') {
        return [
          {
            id: 2,
            productId: 20,
            supplierSku: 'sku-1',
            product: { id: 20, name: 'SKU product' },
          },
        ];
      }
      if (where.supplierName) {
        return [
          {
            id: 1,
            productId: 10,
            supplierName: 'Same name',
            product: { id: 10, name: 'Name product' },
          },
        ];
      }
      return [];
    });

    await expect(
      matcher.match('company', 1, {
        rawName: 'Same name',
        rawSku: 'sku-1',
      }),
    ).resolves.toMatchObject({
      product: { id: 20 },
      method: 'SUPPLIER_SKU',
      conflict: false,
    });
    expect(db.supplierProductAlias.findMany).toHaveBeenCalledTimes(1);
  });
  it('reports ambiguous aliases independently of database row order', async () => {
    for (const aliases of [
      [
        { id: 1, productId: 10, product: { id: 10 } },
        { id: 2, productId: 20, product: { id: 20 } },
      ],
      [
        { id: 2, productId: 20, product: { id: 20 } },
        { id: 1, productId: 10, product: { id: 10 } },
      ],
    ]) {
      db.supplierProductAlias.findMany.mockResolvedValueOnce(aliases);
      await expect(
        matcher.match('company', 1, { rawName: 'Ambiguous' }),
      ).resolves.toMatchObject({
        product: null,
        method: 'ALIAS_CONFLICT',
        conflict: true,
      });
    }
    expect(db.supplierProductAlias.update).not.toHaveBeenCalled();
  });
  it('keeps feature conflicts for review', async () => {
    db.product.findMany.mockResolvedValue([
      { id: 1, name: 'phone alpha black' },
    ]);
    expect(
      await matcher.match('company', 1, { rawName: 'phone alpha white' }),
    ).toMatchObject({ confidence: 60, conflict: true });
  });
  it('marks unmatched rows NEW_PRODUCT and clears previous match metadata', async () => {
    db.product.findMany.mockResolvedValue([{ id: 1, name: 'alpha beta' }]);
    const service = new SupplierInvoiceService(
      db,
      matcher,
      normalizer,
      {} as any,
    );
    jest.spyOn(service, 'get').mockResolvedValue({
      status: 'REVIEW',
      supplierId: 1,
      items: [
        {
          id: 'new',
          rawName: 'unique',
          matchedProductId: 1,
          matchConfidence: 0,
        },
        { id: 'review', rawName: 'alpha beta' },
      ],
    } as any);
    const result = await service.autoMatch(
      'invoice',
      testContext({ companyId: 'company', userId: 1 }),
    );
    expect(result.summary).toEqual({
      total: 2,
      matched: 0,
      needsReview: 1,
      newProducts: 1,
    });
    expect(result.items[0]).toMatchObject({
      product: null,
      confidence: null,
      matchMethod: null,
      status: 'NEW_PRODUCT',
    });
    expect(db.supplierInvoiceItem.update).toHaveBeenCalledWith({
      where: { id: 'new' },
      data: {
        matchedProductId: null,
        matchMethod: null,
        matchConfidence: null,
        status: 'NEW_PRODUCT',
        userConfirmed: false,
      },
    });
    expect(db.product.findMany).toHaveBeenCalledTimes(1);
    expect(db.supplierProductAlias.findMany).toHaveBeenCalledTimes(1);
  });
});
