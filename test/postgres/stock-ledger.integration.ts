import { ConflictException } from '@nestjs/common';
import { Client } from 'pg';
import { moveVariantStock, setVariantStock } from '../../src/common/stock-ledger';
import { database, fixture } from './support';

const connectionString = process.env.TEST_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname.startsWith('/konkurent_test_current_')
)
  throw new Error('Run through test/postgres/run.cjs');

const COMPANY = 'ledger-co';

describe('Variant stock ledger triggers', () => {
  const db = new Client({ connectionString });
  const one = async (text: string, params?: unknown[]) =>
    (await db.query(text, params)).rows[0];

  beforeAll(() => db.connect());
  afterAll(() => db.end());
  beforeEach(async () => {
    await db.query('BEGIN');
    await db.query(`
      INSERT INTO "Company" (id, login, name, subdomain, "updatedAt") VALUES
        ('${COMPANY}', '${COMPANY}', 'L', '${COMPANY}', now());
      INSERT INTO "Shop" (id, "companyId", name, "branchCode", "updatedAt") VALUES
        ('l-s1', '${COMPANY}', 'S1', 'L1', now());
      INSERT INTO "Product" (id, "publicId", "companyId", name, quantity, "updatedAt") VALUES
        (930001, 'l-p1', '${COMPANY}', 'Simple', 0, now());
      INSERT INTO "ProductVariant" (id, "companyId", "productId", "isDefault", "updatedAt") VALUES
        ('l-v1', '${COMPANY}', 930001, true, now());
    `);
  });
  afterEach(() => db.query('ROLLBACK'));

  const shopQuantity = async (productId: number) =>
    (
      await one(
        `SELECT quantity FROM "ProductStock" WHERE "productId" = $1 AND "shopId" = 'l-s1'`,
        [productId],
      )
    )?.quantity;
  const productQuantity = async (productId: number) =>
    (await one(`SELECT quantity FROM "Product" WHERE id = $1`, [productId]))
      .quantity;

  it('derives shop and product quantity from variant stock', async () => {
    await db.query(`INSERT INTO "ProductVariantStock" (id, "companyId", "variantId", "shopId", "branchCode", quantity, "updatedAt")
      VALUES ('l-vs1', '${COMPANY}', 'l-v1', 'l-s1', 'L1', 5, now())`);
    expect(await shopQuantity(930001)).toBe(5);
    expect(await productQuantity(930001)).toBe(5);

    await db.query(`UPDATE "ProductVariantStock" SET quantity = quantity - 2 WHERE id = 'l-vs1'`);
    expect(await shopQuantity(930001)).toBe(3);
    expect(await productQuantity(930001)).toBe(3);

    await db.query(`DELETE FROM "ProductVariantStock" WHERE id = 'l-vs1'`);
    expect(await shopQuantity(930001)).toBe(0);
    expect(await productQuantity(930001)).toBe(0);
  });

  it('rejects direct ProductStock quantity writes but allows prices', async () => {
    await db.query(`INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity, "salePrice", "updatedAt")
      VALUES (930001, 'l-s1', 'L1', 0, 10, now())`);
    await db.query(`UPDATE "ProductStock" SET "salePrice" = 12 WHERE "productId" = 930001`);

    await db.query('SAVEPOINT attempt');
    await expect(
      db.query(`UPDATE "ProductStock" SET quantity = 9 WHERE "productId" = 930001`),
    ).rejects.toThrow(/follows ProductVariantStock/);
    await db.query('ROLLBACK TO SAVEPOINT attempt');

    await db.query(`SELECT set_config('konkurent.stock_ledger', 'bypass', true)`);
    await db.query(`UPDATE "ProductStock" SET quantity = 9 WHERE "productId" = 930001`);
    expect(await shopQuantity(930001)).toBe(9);
  });

  it('aligns legacy stock without losing any quantity', async () => {
    await db.query(`SELECT set_config('konkurent.stock_ledger', 'bypass', true)`);
    await db.query(`
      INSERT INTO "ProductColor" (id, "companyId", name, "updatedAt") VALUES
        ('l-red', '${COMPANY}', 'Red', now());
      INSERT INTO "Product" (id, "publicId", "companyId", name, quantity, "updatedAt") VALUES
        (930002, 'l-p2', '${COMPANY}', 'Sold without size', 4, now()),
        (930003, 'l-p3', '${COMPANY}', 'Catalog bug', 0, now()),
        (930004, 'l-p4', '${COMPANY}', 'No variant', 2, now());
      INSERT INTO "ProductVariant" (id, "companyId", "productId", "colorId", "isDefault", "updatedAt") VALUES
        ('l-v2d', '${COMPANY}', 930002, NULL, true, now()),
        ('l-v2r', '${COMPANY}', 930002, 'l-red', false, now()),
        ('l-v3r', '${COMPANY}', 930003, 'l-red', false, now());
      INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity, "updatedAt") VALUES
        (930001, 'l-s1', 'L1', 5, now()),
        (930002, 'l-s1', 'L1', 4, now()),
        (930003, 'l-s1', 'L1', 0, now()),
        (930004, 'l-s1', 'L1', 2, now());
      INSERT INTO "ProductVariantStock" (id, "companyId", "variantId", "shopId", "branchCode", quantity, "updatedAt") VALUES
        ('l-vs1', '${COMPANY}', 'l-v1', 'l-s1', 'L1', 8, now()),
        ('l-vs2d', '${COMPANY}', 'l-v2d', 'l-s1', 'L1', 4, now()),
        ('l-vs2r', '${COMPANY}', 'l-v2r', 'l-s1', 'L1', 1, now()),
        ('l-vs3r', '${COMPANY}', 'l-v3r', 'l-s1', 'L1', 5, now());
    `);
    await db.query(`SELECT set_config('konkurent.stock_ledger', '', true)`);

    await db.query(`SELECT stock_ledger_align()`);

    const variantStock = async (variantId: string) =>
      (await one(`SELECT quantity FROM "ProductVariantStock" WHERE "variantId" = $1`, [variantId]))
        ?.quantity;
    // Simple: stale default variant follows ProductStock.
    expect(await variantStock('l-v1')).toBe(5);
    expect(await shopQuantity(930001)).toBe(5);
    // Colour product sold without a size: residue kept on the default variant.
    expect(await variantStock('l-v2d')).toBe(3);
    expect(await variantStock('l-v2r')).toBe(1);
    expect(await shopQuantity(930002)).toBe(4);
    // Sizes above ProductStock: the shop total rises to the size sum.
    expect(await shopQuantity(930003)).toBe(5);
    expect(await productQuantity(930003)).toBe(5);
    // A product without variants gets a default one holding its stock.
    expect(
      await one(
        `SELECT v."isDefault", vs.quantity FROM "ProductVariant" v
         JOIN "ProductVariantStock" vs ON vs."variantId" = v.id WHERE v."productId" = 930004`,
      ),
    ).toEqual({ isDefault: true, quantity: 2 });
    // The ledger trigger is active again after the alignment.
    await db.query(`UPDATE "ProductVariantStock" SET quantity = 6 WHERE id = 'l-vs1'`);
    expect(await shopQuantity(930001)).toBe(6);
  });
});

describe('moveVariantStock on PostgreSQL', () => {
  const { client, close } = database();
  afterAll(close);

  it('lets only one of two concurrent takes have the last unit', async () => {
    const f = await fixture(client, 1);
    const take = () =>
      client.$transaction((tx) =>
        moveVariantStock(tx, {
          companyId: f.company.id,
          shopId: f.shop.id,
          branchCode: f.shop.branchCode,
          productId: f.product.id,
          delta: -1,
        }),
      );

    const results = await Promise.allSettled([take(), take()]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(rejected?.reason).toBeInstanceOf(ConflictException);
    const stock = await client.productStock.findFirstOrThrow({
      where: { productId: f.product.id },
    });
    expect(stock.quantity).toBe(0);
  });

  it('sets an absolute quantity and reports a concurrent change', async () => {
    const f = await fixture(client, 3);
    const target = {
      companyId: f.company.id,
      shopId: f.shop.id,
      branchCode: f.shop.branchCode,
      productId: f.product.id,
    };

    const result = await client.$transaction((tx) =>
      setVariantStock(tx, { ...target, quantity: 7 }),
    );

    expect(result).toMatchObject({ delta: 4, beforeQuantity: 3, afterQuantity: 7 });
    expect(
      (await client.product.findUniqueOrThrow({ where: { id: f.product.id } }))
        .quantity,
    ).toBe(7);
  });
});
