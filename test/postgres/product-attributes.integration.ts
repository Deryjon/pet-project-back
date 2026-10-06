import { BadRequestException, ConflictException } from '@nestjs/common';
import { ProductAttributesService } from '../../src/product-attributes/product-attributes.service';
import { database, fixture } from './support';

describe('ProductAttributesService on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);
  const service = new ProductAttributesService(client as any);

  async function shirt() {
    const f = await fixture(client, 0);
    const red = await client.productColor.create({
      data: { companyId: f.company.id, name: 'Red' },
    });
    const [tall, regular] = await Promise.all(
      ['tall', 'regular'].map((id) =>
        client.productVariant.create({
          data: { companyId: f.company.id, productId: f.product.id, colorId: red.id, sku: `${f.company.id}-${id}` },
        }),
      ),
    );
    const height = await service.create(
      { name: 'Рост', code: 'height', kind: 'SELECT' },
      f.context,
    );
    const [h170, h180] = await Promise.all(
      ['170', '180'].map((value) =>
        service.createOption(height.id, { value }, f.context),
      ),
    );
    return { f, tall, regular, height, h170, h180 };
  }

  it('adds a custom axis next to the mirrored colour and keys variants by both', async () => {
    const { f, tall, regular, height, h170, h180 } = await shirt();

    await service.setVariantValues(
      tall.id,
      { values: [{ definition_id: height.id, option_id: h180.id }] },
      f.context,
    );
    await service.setVariantValues(
      regular.id,
      { values: [{ definition_id: height.id, option_id: h170.id }] },
      f.context,
    );

    const variants = await client.productVariant.findMany({
      where: { id: { in: [tall.id, regular.id] } },
      include: { attributeOptions: { include: { definition: true } } },
    });
    for (const variant of variants) {
      expect(variant.attributeOptions.map((v) => v.definition.code).sort()).toEqual([
        'color',
        'height',
      ]);
    }
    expect(new Set(variants.map((v) => v.optionsKey)).size).toBe(2);

    const list = await service.list(f.context);
    expect(list.map((d) => [d.code, d.legacy_source])).toEqual(
      expect.arrayContaining([
        ['color', 'color'],
        ['height', null],
      ]),
    );
  });

  it('rejects a second variant with the same combination', async () => {
    const { f, tall, regular, height, h180 } = await shirt();
    await service.setVariantValues(
      tall.id,
      { values: [{ definition_id: height.id, option_id: h180.id }] },
      f.context,
    );

    await expect(
      service.setVariantValues(
        regular.id,
        { values: [{ definition_id: height.id, option_id: h180.id }] },
        f.context,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    // The rejected write was rolled back.
    expect(
      await client.variantAttributeValue.count({
        where: { variantId: regular.id, definitionId: height.id },
      }),
    ).toBe(0);
  });

  it('keeps colour/size options in their dictionaries and stores product-level values', async () => {
    const { f } = await shirt();
    const color = (await service.list(f.context)).find((d) => d.code === 'color')!;

    await expect(
      service.createOption(color.id, { value: 'Blue' }, f.context),
    ).rejects.toBeInstanceOf(BadRequestException);

    const material = await service.create(
      { name: 'Материал', code: 'material', kind: 'TEXT' },
      f.context,
    );
    expect(material.is_variant_axis).toBe(false);
    const saved = await service.setProductValues(
      f.product.publicId,
      { values: [{ definition_id: material.id, value: 'Хлопок' }] },
      f.context,
    );
    expect(saved).toEqual([
      expect.objectContaining({ code: 'material', value: 'Хлопок' }),
    ]);
  });
});
