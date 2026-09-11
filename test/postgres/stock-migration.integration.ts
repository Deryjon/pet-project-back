import { readFileSync } from 'fs';
import { join } from 'path';
import { Client } from 'pg';

const sql = readFileSync(
  join(
    __dirname,
    '../../prisma/migrations/20260909090000_product_stock_shop_identity/migration.sql',
  ),
  'utf8',
);
const connectionString = process.env.TEST_LEGACY_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname.startsWith('/konkurent_test_legacy_')
)
  throw new Error('Run through test/postgres/run.cjs');

describe('ProductStock migration on an upgraded legacy PostgreSQL schema', () => {
  const db = new Client({ connectionString });
  beforeAll(() => db.connect());
  afterAll(() => db.end());
  beforeEach(async () => {
    await db.query('BEGIN');
    await db.query(`INSERT INTO "Company" (id, login, name, subdomain, "updatedAt") VALUES
      ('fixture-a','fixture-a','A','fixture-a',now()), ('fixture-b','fixture-b','B','fixture-b',now());
      INSERT INTO "Shop" (id,"companyId",name,"branchCode","updatedAt") VALUES
      ('shop-a','fixture-a','A','001',now()), ('shop-b','fixture-b','B','001',now());
      INSERT INTO "Product" (id,"publicId","companyId",name,quantity,"updatedAt") VALUES
      (900001,'fixture-product-a','fixture-a','A',7.25,now()), (900002,'fixture-product-b','fixture-b','B',3.5,now());
      INSERT INTO "ProductStock" ("productId","branchCode",quantity,"purchasePrice","salePrice","updatedAt") VALUES
      (900001,'001',7.25,12.5,20,now()), (900002,'001',3.5,8.5,15,now());`);
  });
  afterEach(() => db.query('ROLLBACK'));

  async function expectRejected(query: string, pattern: RegExp) {
    await db.query('SAVEPOINT attempt');
    try {
      await expect(db.query(query)).rejects.toThrow(pattern);
    } finally {
      await db.query('ROLLBACK TO SAVEPOINT attempt');
    }
  }

  it('maps identical branch codes by product company and preserves stock and prices', async () => {
    const before = (
      await db.query(
        'SELECT id,"productId","branchCode",quantity,"purchasePrice","salePrice" FROM "ProductStock" ORDER BY id',
      )
    ).rows;
    await db.query(sql);
    const after = (await db.query('SELECT * FROM "ProductStock" ORDER BY id'))
      .rows;
    expect(after.map(({ shopId }) => shopId)).toEqual(['shop-a', 'shop-b']);
    expect(
      after.map((row) =>
        Object.fromEntries(
          Object.keys(before[0]).map((key) => [key, row[key]]),
        ),
      ),
    ).toEqual(before);
    await expectRejected(
      `INSERT INTO "ProductStock" ("productId","shopId","branchCode",quantity,"updatedAt") VALUES (900001,'shop-a','001',1,now())`,
      /unique constraint/,
    );
    await expectRejected(
      `INSERT INTO "ProductStock" ("productId","shopId","branchCode",quantity,"updatedAt") VALUES (900001,'missing','002',1,now())`,
      /foreign key constraint/,
    );
    await expectRejected(
      `INSERT INTO "ProductStock" ("productId","branchCode",quantity,"updatedAt") VALUES (900001,'002',1,now())`,
      /null value.*shopId/,
    );
  });

  it('rejects duplicates before changing data or adding shopId', async () => {
    await db.query(
      `INSERT INTO "ProductStock" ("productId","branchCode",quantity,"updatedAt") VALUES (900001,'001',2,now())`,
    );
    await expectRejected(sql, /duplicate productId\/branchCode/);
    expect(
      (
        await db.query(
          `SELECT 1 FROM information_schema.columns WHERE table_name='ProductStock' AND column_name='shopId'`,
        )
      ).rowCount,
    ).toBe(0);
    expect(
      (
        await db.query(
          `SELECT sum(quantity) AS total FROM "ProductStock" WHERE "productId"=900001`,
        )
      ).rows[0].total,
    ).toBe(9.25);
  });

  it('rejects a branch that exists only in another company', async () => {
    await db.query(`UPDATE "Shop" SET "branchCode"='002' WHERE id='shop-a'`);
    await expectRejected(sql, /without a matching shop/);
    expect(
      (
        await db.query(
          `SELECT "branchCode" FROM "ProductStock" WHERE "productId"=900001`,
        )
      ).rows[0].branchCode,
    ).toBe('001');
  });

  it('rejects an orphan branch instead of choosing an arbitrary shop', async () => {
    await db.query(
      `UPDATE "ProductStock" SET "branchCode"='missing' WHERE "productId"=900001`,
    );
    await expectRejected(sql, /without a matching shop/);
  });
});
