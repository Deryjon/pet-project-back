import { Client } from 'pg';

const connectionString = process.env.TEST_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname.startsWith('/konkurent_test_current_')
)
  throw new Error('Run through test/postgres/run.cjs');

const COMPANY = 'attr-co';

describe('Tenant attributes mirrored from legacy colour/size', () => {
  const db = new Client({ connectionString });
  const one = async (text: string, params?: unknown[]) =>
    (await db.query(text, params)).rows[0];
  const all = async (text: string, params?: unknown[]) =>
    (await db.query(text, params)).rows;

  beforeAll(() => db.connect());
  afterAll(() => db.end());
  beforeEach(() => db.query('BEGIN'));
  afterEach(() => db.query('ROLLBACK'));

  async function seed() {
    await db.query(`
      INSERT INTO "Company" (id, login, name, subdomain, "updatedAt") VALUES
        ('${COMPANY}', '${COMPANY}', 'A', '${COMPANY}', now());
      INSERT INTO "ProductColor" (id, "companyId", name, code, "updatedAt") VALUES
        ('a-red', '${COMPANY}', 'Red', '#f00', now());
      INSERT INTO "ProductSize" (id, "companyId", name, type, "sortOrder", "updatedAt") VALUES
        ('a-m', '${COMPANY}', 'M', 'CLOTHING', 2, now());
      INSERT INTO "Product" (id, "publicId", "companyId", name, "updatedAt") VALUES
        (920001, 'a-p1', '${COMPANY}', 'Shirt', now());
      INSERT INTO "ProductVariant" (id, "companyId", "productId", "colorId", "sizeId", "updatedAt") VALUES
        ('a-v1', '${COMPANY}', 920001, 'a-red', 'a-m', now());
    `);
  }

  const values = (variantId: string) =>
    all(
      `SELECT d.code, o.value FROM "VariantAttributeValue" vav
       JOIN "AttributeDefinition" d ON d.id = vav."definitionId"
       JOIN "AttributeOption" o ON o.id = vav."optionId"
       WHERE vav."variantId" = $1 ORDER BY d.code`,
      [variantId],
    );
  const optionsKey = async (variantId: string) =>
    (await one(`SELECT "optionsKey" FROM "ProductVariant" WHERE id = $1`, [variantId]))
      .optionsKey;

  it('mirrors colours, sizes and variant axes as they are written', async () => {
    await seed();

    expect(
      await all(
        `SELECT code, name, "legacySource", "sortOrder" FROM "AttributeDefinition"
         WHERE "companyId" = $1 ORDER BY "sortOrder"`,
        [COMPANY],
      ),
    ).toEqual([
      { code: 'color', name: 'Цвет', legacySource: 'color', sortOrder: 0 },
      { code: 'size_clothing', name: 'Размер одежды', legacySource: 'size', sortOrder: 1 },
    ]);
    expect(
      await one(`SELECT value, meta FROM "AttributeOption" WHERE "legacyColorId" = 'a-red'`),
    ).toEqual({ value: 'Red', meta: { code: '#f00' } });
    expect(await values('a-v1')).toEqual([
      { code: 'color', value: 'Red' },
      { code: 'size_clothing', value: 'M' },
    ]);
    expect((await optionsKey('a-v1')).split('|')).toHaveLength(2);
    expect(
      await all(
        `SELECT d.code FROM "ProductAttributeAxis" a JOIN "AttributeDefinition" d
         ON d.id = a."definitionId" WHERE a."productId" = 920001 ORDER BY a."sortOrder"`,
      ),
    ).toEqual([{ code: 'color' }, { code: 'size_clothing' }]);
  });

  it('follows renames, size type moves and removals', async () => {
    await seed();
    const keyBefore = await optionsKey('a-v1');

    await db.query(`UPDATE "ProductColor" SET name = 'Crimson' WHERE id = 'a-red'`);
    await db.query(`UPDATE "ProductSize" SET type = 'SHOES' WHERE id = 'a-m'`);
    expect(await values('a-v1')).toEqual([
      { code: 'color', value: 'Crimson' },
      { code: 'size_shoes', value: 'M' },
    ]);
    expect(await optionsKey('a-v1')).not.toBe(keyBefore);

    await db.query(`UPDATE "ProductVariant" SET "sizeId" = NULL WHERE id = 'a-v1'`);
    expect(await values('a-v1')).toEqual([{ code: 'color', value: 'Crimson' }]);

    await db.query(`DELETE FROM "ProductColor" WHERE id = 'a-red'`);
    expect(await values('a-v1')).toEqual([]);
    expect(await optionsKey('a-v1')).toBeNull();
    expect(
      await one(`SELECT count(*)::int AS n FROM "AttributeOption" WHERE "legacyColorId" = 'a-red'`),
    ).toEqual({ n: 0 });
  });

  it('backfills rows written before the triggers existed, idempotently', async () => {
    await db.query(`SET LOCAL session_replication_role = replica`);
    await seed();
    await db.query(`SET LOCAL session_replication_role = origin`);
    expect(await values('a-v1')).toEqual([]);

    await db.query(`SELECT attr_backfill_legacy()`);
    await db.query(`SELECT attr_backfill_legacy()`);

    expect(await values('a-v1')).toEqual([
      { code: 'color', value: 'Red' },
      { code: 'size_clothing', value: 'M' },
    ]);
    expect(
      await one(
        `SELECT count(*)::int AS n FROM "AttributeDefinition" WHERE "companyId" = $1`,
        [COMPANY],
      ),
    ).toEqual({ n: 3 });
  });
});
