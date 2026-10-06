import { isValidEan13, formatInternalEan13 } from '../../src/common/ean13';
import { ProductsService } from '../../src/products/products.service';
import { database, fixture } from './support';

describe('Variant barcode generation on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);
  const settings = new Proxy({}, { get: () => () => '' });
  const service = new ProductsService(client as any, settings as any);

  it('gives variants without a barcode unique valid in-store EAN-13 codes', async () => {
    const f = await fixture(client, 0);
    const companyId = f.company.id;
    // The product itself already holds the next in-store code.
    const productCode = formatInternalEan13(200000000001);
    await client.product.update({
      where: { id: f.product.id },
      data: { barcode: productCode },
    });
    const sizes = await Promise.all(
      ['S', 'M', 'L', 'XL'].map((name) =>
        client.productSize.create({
          data: { companyId, name, type: 'CLOTHING' },
        }),
      ),
    );
    const kept = await client.productVariant.create({
      data: {
        companyId,
        productId: f.product.id,
        sizeId: sizes[0].id,
        barcode: '4600000000003',
      },
    });
    const missing = await Promise.all(
      sizes.slice(1).map((size, index) =>
        client.productVariant.create({
          data: {
            companyId,
            productId: f.product.id,
            sizeId: size.id,
            barcode: index === 0 ? '' : null,
          },
        }),
      ),
    );

    const result = await service.ensureVariantBarcodes(
      { product_ids: [f.product.publicId] },
      f.context,
    );

    expect(result).toEqual({ generated: 3 });
    const variants = await client.productVariant.findMany({
      where: { productId: f.product.id, isDefault: false },
    });
    expect(variants.find((v) => v.id === kept.id)?.barcode).toBe(
      '4600000000003',
    );
    const generated = variants
      .filter((v) => missing.some((m) => m.id === v.id))
      .map((v) => v.barcode!);
    expect(generated).toHaveLength(3);
    expect(new Set(generated).size).toBe(3);
    for (const code of generated) {
      expect(code).toMatch(/^2\d{12}$/);
      expect(isValidEan13(code)).toBe(true);
      expect(code).not.toBe(productCode);
    }

    // Nothing left to generate on a second call.
    await expect(
      service.ensureVariantBarcodes(
        { product_ids: [String(f.product.id)] },
        f.context,
      ),
    ).resolves.toEqual({ generated: 0 });
  });
});
