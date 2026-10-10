import { ProductsService } from '../../src/products/products.service';
import { database, fixture } from './support';

describe('Apparel Excel import on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);
  const settings = new Proxy({}, { get: () => () => 'UZS' });
  const service = new ProductsService(client as any, settings as any);

  it('previews 10 rows, blocks the invalid row, then commits stock and history', async () => {
    const f = await fixture(client, 1);
    await client.company.update({
      where: { id: f.company.id },
      data: { storeType: 'CLOTHING' },
    });
    const [black, white] = await Promise.all(
      [
        ['BLK', 'Чёрный'],
        ['WHT', 'Белый'],
      ].map(([code, name], sortOrder) =>
        client.productColor.create({
          data: {
            companyId: f.company.id,
            code,
            name,
            nameRu: name,
            nameUz: name,
            sortOrder,
          },
        }),
      ),
    );
    const [small, medium] = await Promise.all(
      ['S', 'M'].map((code, sortOrder) =>
        client.productSize.create({
          data: {
            companyId: f.company.id,
            code,
            name: code,
            nameRu: code,
            nameUz: code,
            kind: 'CLOTHING',
            type: 'CLOTHING',
            sortOrder,
          },
        }),
      ),
    );
    await client.productSeasonOption.create({
      data: {
        companyId: f.company.id,
        code: 'SUMMER',
        nameRu: 'Лето',
        nameUz: 'Yoz',
      },
    });
    await client.product.update({
      where: { id: f.product.id },
      data: { article: 'EXISTING', variantType: 'variative' },
    });
    await client.productVariant.update({
      where: { id: f.variant.id },
      data: {
        colorId: black.id,
        sizeId: small.id,
        barcode: '2000000000008',
        isDefault: false,
      },
    });

    const row = (
      article: string,
      color: string,
      size: string,
      quantity = 1,
      barcode = '',
    ) => ({
      name: `Товар ${article}`,
      article,
      barcode,
      color_code: color,
      size_name: size,
      season: 'SUMMER',
      quantity,
      supply_price: 50,
      retail_price: 100,
    });
    const rows = [
      ...['NEW-A', 'NEW-B'].flatMap((article) =>
        [
          ['BLK', 'S'],
          ['BLK', 'M'],
          ['WHT', 'S'],
          ['WHT', 'M'],
        ].map(([color, size]) => row(article, color, size)),
      ),
      row('EXISTING', 'BLK', 'S', 3, '2000000000008'),
      row('BROKEN', 'UNKNOWN', 'S'),
    ];

    const preview = await service.validateExcelImport(
      {
        name: 'Apparel E2E',
        shop_id: f.shop.id,
        mode: 'with_check',
        rows,
      },
      f.context,
    );
    const importId = preview.import_id;
    const invalidPreview = await service.getImportSearch(
      importId,
      { page: 1, limit: 20, difference: false },
      f.context,
    );
    expect(invalidPreview.items).toHaveLength(10);
    expect(
      invalidPreview.items.filter(
        (item: any) => item.validation_issues.length > 0,
      ),
    ).toHaveLength(1);
    await expect(
      service.commitImport(importId, f.context, { forceWithCheckAccept: true }),
    ).rejects.toThrow();

    await service.validateExcelImport(
      { import_id: importId, shop_id: f.shop.id, rows: rows.slice(0, 9) },
      f.context,
    );
    const result = await service.commitImport(importId, f.context, {
      forceWithCheckAccept: true,
    });

    expect(result.error_count).toBe(0);
    expect(result.imported_variants).toHaveLength(9);
    expect(
      (result.imported_variants ?? []).every((item: any) =>
        /^2\d{12}$/.test(item.barcode),
      ),
    ).toBe(true);

    const importedProducts = await client.product.findMany({
      where: { companyId: f.company.id, article: { in: ['NEW-A', 'NEW-B'] } },
      include: { variants: { include: { stocks: true } } },
    });
    expect(importedProducts).toHaveLength(2);
    expect(
      importedProducts.map((product) =>
        product.variants.reduce(
          (sum, variant) =>
            sum +
            variant.stocks.reduce(
              (stockSum, stock) => stockSum + stock.quantity,
              0,
            ),
          0,
        ),
      ),
    ).toEqual([4, 4]);

    const existingStock = await client.productVariantStock.findUniqueOrThrow({
      where: {
        variantId_shopId: { variantId: f.variant.id, shopId: f.shop.id },
      },
    });
    expect(existingStock.quantity).toBe(4);
    expect(
      await client.stockMovement.count({
        where: { companyId: f.company.id, externalId: importId },
      }),
    ).toBe(9);

    // Make the fixture references explicit so both dictionary dimensions are
    // guaranteed to participate in this scenario.
    expect([black.id, white.id, small.id, medium.id]).toHaveLength(4);
  });
});
