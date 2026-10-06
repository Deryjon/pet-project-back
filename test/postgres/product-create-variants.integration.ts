import { ProductsService } from '../../src/products/products.service';
import { database, fixture } from './support';

describe('Catalog product create with colour variants on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);
  // Company settings only format the response; any method returns a string.
  const settings = new Proxy({}, { get: () => () => '' });
  const service = new ProductsService(client as any, settings as any);

  async function setup() {
    const f = await fixture(client, 0);
    const unit = await client.measurementUnitSetting.create({
      data: {
        id: `unit-${f.company.id}`,
        companyId: f.company.id,
        name: 'Штука',
        shortName: 'шт',
        precision: '0',
      },
    });
    const [red, blue] = await Promise.all(
      ['Red', 'Blue'].map((name) =>
        client.productColor.create({ data: { companyId: f.company.id, name } }),
      ),
    );
    return { f, unit, red, blue };
  }

  function payload(
    f: Awaited<ReturnType<typeof setup>>,
    extra: Record<string, unknown> = {},
  ) {
    return {
      name: 'Футболка',
      product_type_id: 'goods',
      measurement_type: 'unit',
      measurement_unit_id: f.unit.id,
      supply_price: 50,
      retail_price: 100,
      shop_measurement_values: [
        { shop_id: f.f.shop.id, measurement_value: 0 },
      ],
      shop_prices: [
        { shop_id: f.f.shop.id, supply_price: 50, retail_price: 100 },
      ],
      variants: [
        { color_id: f.red.id, supply_price: 50, retail_price: 100, stocks: { [f.f.shop.id]: 3 } },
        { color_id: f.blue.id, supply_price: 50, retail_price: 100, stocks: { [f.f.shop.id]: 5 } },
      ],
      ...extra,
    };
  }

  async function stockOf(productId: number) {
    const [product, variants] = await Promise.all([
      client.product.findUniqueOrThrow({
        where: { id: productId },
        include: { stocks: true },
      }),
      client.productVariant.findMany({
        where: { productId, isActive: true, isDefault: false },
        include: { stocks: true },
      }),
    ]);
    return {
      variantType: product.variantType,
      total: product.quantity,
      shop: product.stocks.map((s) => s.quantity),
      variants: variants
        .map((v) => v.stocks.reduce((sum, s) => sum + s.quantity, 0))
        .sort(),
    };
  }

  it('creates the colour variants with their quantities when the flag is missing', async () => {
    const f = await setup();
    const created = await service.createCatalogProduct(payload(f), f.f.context);

    expect(await stockOf(Number(created.id))).toEqual({
      variantType: 'variative',
      total: 8,
      shop: [8],
      variants: [3, 5],
    });
  });

  it('honours an explicit is_variative flag', async () => {
    const f = await setup();
    const created = await service.createCatalogProduct(
      payload(f, { is_variative: true }),
      f.f.context,
    );

    expect((await stockOf(Number(created.id))).variants).toEqual([3, 5]);
  });
});
