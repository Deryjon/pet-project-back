import { ProductsService } from '../../src/products/products.service';
import { database, fixture } from './support';

describe('Variant availability matrix on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);
  const settings = new Proxy({}, { get: () => () => '' });
  const service = new ProductsService(client as any, settings as any);

  it('returns colour × size stock of the allowed shops only', async () => {
    // Two units without a colour/size sit on the default variant.
    const f = await fixture(client, 2);
    const companyId = f.company.id;
    const otherShop = await client.shop.create({
      data: { companyId, name: 'Hidden shop', branchCode: '002' },
    });
    const [red, blue] = await Promise.all(
      ['Red', 'Blue'].map((name) =>
        client.productColor.create({ data: { companyId, name } }),
      ),
    );
    const [s, m] = await Promise.all(
      ['S', 'M'].map((name) =>
        client.productSize.create({
          data: { companyId, name, type: 'CLOTHING' },
        }),
      ),
    );

    async function variant(
      colorId: string,
      sizeId: string,
      stocks: Array<[typeof f.shop, number]>,
      extra: { salePrice?: number; isActive?: boolean } = {},
    ) {
      const created = await client.productVariant.create({
        data: {
          companyId,
          productId: f.product.id,
          colorId,
          sizeId,
          salePrice: extra.salePrice ?? 10,
          isActive: extra.isActive ?? true,
        },
      });
      for (const [shop, quantity] of stocks) {
        await client.productVariantStock.create({
          data: {
            companyId,
            variantId: created.id,
            shopId: shop.id,
            branchCode: shop.branchCode,
            quantity,
            salePrice: extra.salePrice ?? 10,
          },
        });
      }
      return created;
    }

    const redS = await variant(red.id, s.id, [[f.shop, 3], [otherShop, 7]]);
    const redM = await variant(red.id, m.id, [[f.shop, 0]]);
    const blueS = await variant(blue.id, s.id, [[f.shop, 1]], { salePrice: 12 });
    // Blue/M exists only as a removed variant: the matrix shows it as missing.
    await variant(blue.id, m.id, [[f.shop, 5]], { isActive: false });

    const matrix = await service.getVariantMatrix(f.product.publicId, f.context);

    expect(matrix.base_sale_price).toBe(10);
    expect(matrix.shops).toEqual([
      { id: f.shop.id, name: 'Test shop', base_sale_price: 10 },
    ]);
    expect(matrix.colors.map((c) => c.name)).toEqual(['Blue', 'Red']);
    expect(matrix.sizes.map((size) => size.name).sort()).toEqual(['M', 'S']);
    expect(matrix.unassigned).toEqual({ [f.shop.id]: 2 });
    expect(
      matrix.variants
        .map((v) => [v.id, v.sale_price, v.stocks])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual(
      [
        [redS.id, 10, { [f.shop.id]: { quantity: 3, sale_price: 10 } }],
        [redM.id, 10, { [f.shop.id]: { quantity: 0, sale_price: 10 } }],
        [blueS.id, 12, { [f.shop.id]: { quantity: 1, sale_price: 12 } }],
      ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    );
  });
});
