import { randomUUID } from 'crypto';
import { AttributeDictionariesService } from '../../src/attribute-dictionaries/attribute-dictionaries.service';
import {
  applyCompany,
  auditCompany,
  auditRowsFromCsv,
  AUDIT_COLUMNS,
  dataChecksum,
  rollbackCompany,
  toCsv,
} from '../../src/attribute-dictionaries/binding';
import { applyDictionaryToImportRow } from '../../src/attribute-dictionaries/import-dictionary';
import { seedSystemAttributeValues } from '../../src/attribute-dictionaries/seed-system-values';
import { PrismaService } from '../../src/prisma/prisma.service';
import { companyContext } from '../fixtures/request-context';
import { database } from './support';

describe('Binding a client to the dictionaries (audit → apply → rollback)', () => {
  const { client: db, close } = database();
  const service = new AttributeDictionariesService(
    db as unknown as PrismaService,
  );

  beforeAll(() => seedSystemAttributeValues(db, 2026));
  afterAll(close);

  /** A clothing client with legacy spellings, as on production. */
  async function client() {
    const key = randomUUID();
    const company = await db.company.create({
      data: {
        login: key,
        subdomain: key,
        name: 'Client',
        storeType: 'CLOTHING',
      },
    });
    const companyId = company.id;
    const role = await db.role.create({
      data: { companyId, name: 'Owner', externalId: 1, isAdmin: true },
    });
    const shop = await db.shop.create({
      data: { companyId, name: 'Main', branchCode: '001' },
    });
    const color = (name: string, code: string, hex: string | null) =>
      db.productColor.create({
        data: { companyId, name, nameRu: name, code, hex },
      });
    const size = (name: string, code: string) =>
      db.productSize.create({
        data: {
          companyId,
          name,
          nameRu: name,
          code,
          type: 'CLOTHING',
          kind: 'CLOTHING',
        },
      });
    const white = await color('Белый', 'WHT', '#fff');
    const multi = await color('Мультиколор', 'MLT', null);
    const xxl = await size('XXL', 'XXL');
    const twoXl = await size('2XL', '2XL');
    const m = await size('M', 'M');
    const summer = await db.productSeasonOption.create({
      data: { companyId, code: 'SUMMER', nameRu: 'Лето', nameUz: 'Yoz' },
    });
    const product = await db.product.create({
      data: {
        companyId,
        name: 'Футболка',
        article: 'TS-1',
        barcode: '2000000000017',
        seasonOptionId: summer.id,
        collection: 'ss 2026',
      },
    });
    const variants = await Promise.all(
      [
        [white, xxl, '2000000000024'],
        [white, twoXl, '2000000000031'],
        [multi, m, '2000000000048'],
      ].map(([c, s, barcode]: any) =>
        db.productVariant.create({
          data: {
            companyId,
            productId: product.id,
            colorId: c.id,
            sizeId: s.id,
            barcode,
            sku: barcode,
          },
        }),
      ),
    );
    for (const variant of variants) {
      await db.productVariantStock.create({
        data: {
          companyId,
          variantId: variant.id,
          shopId: shop.id,
          branchCode: '001',
          quantity: 3,
          salePrice: 100,
          purchasePrice: 40,
        },
      });
    }
    return {
      company,
      companyId,
      context: companyContext({ companyId, crmRoleId: role.id }),
      white,
      multi,
      xxl,
      twoXl,
      m,
      summer,
      product,
      variants,
    };
  }

  it('audits without writing, applies the reviewed CSV and rolls back with data identical', async () => {
    const c = await client();
    const checksum = await dataChecksum(db, c.companyId);
    const productBefore = await db.product.findUniqueOrThrow({
      where: { id: c.product.id },
    });

    const { rows, conflicts } = await auditCompany(db, c.companyId);
    const status = (id: string) => rows.find((row) => row.legacy_id === id);
    expect(status(c.white.id)).toMatchObject({
      status: 'alias',
      proposed_code: '#FFFFFF',
    });
    expect(status(c.multi.id)).toMatchObject({
      status: 'manual',
      proposed_code: '',
    });
    expect(status(c.xxl.id)).toMatchObject({
      status: 'alias',
      proposed_code: '2XL',
    });
    expect(status(c.twoXl.id)).toMatchObject({
      status: 'exact',
      proposed_code: '2XL',
    });
    expect(status(c.summer.id)).toMatchObject({
      status: 'exact',
      proposed_code: 'SUMMER',
    });
    expect(status('ss 2026')).toMatchObject({
      entity: 'collection',
      status: 'alias',
      proposed_code: 'SS26',
    });
    // XXL and 2XL of the same white T-shirt collapse into one pair.
    expect(conflicts).toEqual([
      expect.objectContaining({
        product_id: c.product.id,
        color_code: '#FFFFFF',
        size_code: '2XL',
      }),
    ]);
    expect(await dataChecksum(db, c.companyId)).toEqual(checksum);

    // The owner reviews the CSV: Мультиколор is skipped.
    const reviewed = auditRowsFromCsv(
      toCsv(
        rows.map((row) =>
          row.legacy_id === c.multi.id
            ? { ...row, approved_code: 'skip' }
            : row,
        ),
        AUDIT_COLUMNS,
      ),
    );

    const dry = await applyCompany(db, c.companyId, reviewed, { apply: false });
    expect(dry).toMatchObject({ applied: false, linkedVariants: 5 });
    expect(
      await db.productVariant.count({
        where: { productId: c.product.id, NOT: { sizeValueId: null } },
      }),
    ).toBe(0);
    expect(
      await db.attributeBindingLog.count({ where: { companyId: c.companyId } }),
    ).toBe(0);

    const applied = await applyCompany(db, c.companyId, reviewed, {
      apply: true,
    });
    expect(applied).toMatchObject({
      applied: true,
      linkedLegacy: 5,
      linkedVariants: 5,
      linkedProducts: 2,
      createdValues: 0,
    });
    expect(applied.skipped).toEqual([
      expect.objectContaining({ legacy_id: c.multi.id }),
    ]);
    const linked = await db.productVariant.findMany({
      where: { productId: c.product.id },
      include: { colorValue: true, sizeValue: true },
      orderBy: { barcode: 'asc' },
    });
    expect(
      linked.map((v) => [
        v.colorValue?.code ?? null,
        v.sizeValue?.code ?? null,
      ]),
    ).toEqual([
      ['#FFFFFF', '2XL'],
      ['#FFFFFF', '2XL'],
      [null, 'M'],
    ]);
    const product = await db.product.findUniqueOrThrow({
      where: { id: c.product.id },
      include: { seasonValue: true, collectionValue: true },
    });
    expect([product.seasonValue?.code, product.collectionValue?.code]).toEqual([
      'SUMMER',
      'SS26',
    ]);
    // Articles, barcodes, stock, names, legacy colour/size and updatedAt: identical.
    expect(await dataChecksum(db, c.companyId)).toEqual(checksum);
    expect(product.updatedAt).toEqual(productBefore.updatedAt);
    expect(
      await db.attributeBindingLog.count({
        where: { batchId: applied.batchId },
      }),
    ).toBe(5 + 5 + 2);

    // Applying again changes nothing.
    expect(
      await applyCompany(db, c.companyId, reviewed, { apply: true }),
    ).toMatchObject({ linkedLegacy: 0, linkedVariants: 0 });

    await db.company.update({
      where: { id: c.companyId },
      data: { useAttributeDictionaries: true },
    });
    const rolledBack = await rollbackCompany(db, c.companyId, {
      apply: true,
      batchId: applied.batchId,
    });
    expect(rolledBack.reverted).toBe(12);
    expect(
      await db.productVariant.count({
        where: { companyId: c.companyId, NOT: [{ colorValueId: null }] },
      }),
    ).toBe(0);
    expect(
      await db.productColor.count({
        where: { companyId: c.companyId, NOT: { attributeValueId: null } },
      }),
    ).toBe(0);
    expect(
      (await db.company.findUniqueOrThrow({ where: { id: c.companyId } }))
        .useAttributeDictionaries,
    ).toBe(false);
    expect(await dataChecksum(db, c.companyId)).toEqual(checksum);
  });

  it('lets the product form use dictionary values through legacy rows, with links kept by triggers', async () => {
    const c = await client();
    const black = (await service.list('COLOR', c.context)).find(
      (v) => v.code === '#000000',
    )!;
    expect(
      (
        await service.linkLegacy(black.id, c.context).catch((e) => e)
      ).getStatus(),
    ).toBe(403);
    await db.company.update({
      where: { id: c.companyId },
      data: { useAttributeDictionaries: true },
    });

    // No legacy black: one is created and linked; asking again reuses it.
    const created = await service.linkLegacy(black.id, c.context);
    expect(await service.linkLegacy(black.id, c.context)).toEqual(created);
    const legacyBlack = await db.productColor.findUniqueOrThrow({
      where: { id: created.legacy_id! },
    });
    expect(legacyBlack).toMatchObject({
      name: 'Чёрный',
      hex: '#000000',
      attributeValueId: black.id,
    });

    // The legacy white matches the system white: linked, with its variants.
    const white = (await service.list('COLOR', c.context)).find(
      (v) => v.code === '#FFFFFF',
    )!;
    expect(await service.linkLegacy(white.id, c.context)).toEqual({
      kind: 'color',
      legacy_id: c.white.id,
    });
    expect(
      await db.productVariant.count({
        where: { colorId: c.white.id, colorValueId: white.id },
      }),
    ).toBe(2);

    // A variant saved with the legacy id gets the dictionary link; changing it follows.
    const variant = await db.productVariant.create({
      data: {
        companyId: c.companyId,
        productId: c.product.id,
        colorId: legacyBlack.id,
        sizeId: c.m.id,
      },
    });
    expect(variant.colorValueId).toBe(black.id);
    const moved = await db.productVariant.update({
      where: { id: variant.id },
      data: { colorId: c.white.id },
    });
    expect(moved.colorValueId).toBe(white.id);
    const cleared = await db.productVariant.update({
      where: { id: variant.id },
      data: { colorId: null },
    });
    expect(cleared.colorValueId).toBeNull();

    // A collection is a code on the product; the trigger links it while the flag is on.
    const fw = (await service.list('SEASON', c.context)).find(
      (v) => v.code === 'FW26',
    )!;
    expect(await service.linkLegacy(fw.id, c.context)).toEqual({
      kind: 'collection',
      collection: 'FW26',
    });
    const product = await db.product.update({
      where: { id: c.product.id },
      data: { collection: 'fw-2026' },
    });
    expect(product.collectionValueId).toBe(fw.id);
  });

  it('normalizes Excel values through the dictionary only when the flag is on', async () => {
    const c = await client();
    const row = { colorCode: '#000', sizeName: '2хл' };
    expect(
      await applyDictionaryToImportRow(db, c.companyId, row, { write: false }),
    ).toEqual({
      colorPending: false,
      sizePending: false,
    });
    expect(row).toEqual({ colorCode: '#000', sizeName: '2хл' });

    await db.company.update({
      where: { id: c.companyId },
      data: { useAttributeDictionaries: true },
    });
    const preview = { colorCode: '#000', sizeName: '2хл' };
    expect(
      await applyDictionaryToImportRow(db, c.companyId, preview, {
        write: false,
      }),
    ).toEqual({
      colorPending: true,
      sizePending: false,
    });
    // The preview links nothing; 2хл already resolves to the legacy 2XL row.
    expect(preview.sizeName).toBe('2XL');
    expect(
      await db.productColor.count({
        where: { companyId: c.companyId, hex: '#000000' },
      }),
    ).toBe(0);

    const imported = { colorCode: '#000', sizeName: '2хл' };
    await db.$transaction((tx) =>
      applyDictionaryToImportRow(tx, c.companyId, imported, { write: true }),
    );
    expect(imported.colorCode).toMatch(/^D000000/);
    expect(
      await db.productColor.count({
        where: { companyId: c.companyId, hex: '#000000' },
      }),
    ).toBe(1);
  });
});
