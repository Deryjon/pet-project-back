import { Client } from 'pg';
import {
  auditVariantReadiness,
  repairVariantReadiness,
} from '../../prisma/lib/variant-readiness';

const connectionString = process.env.TEST_DATABASE_URL;
if (
  !connectionString ||
  !new URL(connectionString).pathname.startsWith('/konkurent_test_current_')
)
  throw new Error('Run through test/postgres/run.cjs');

const COMPANY = 'readiness-co';

describe('Variant readiness audit and repair', () => {
  const db = new Client({ connectionString });
  const sql = async (text: string, params?: unknown[]) =>
    (await db.query(text, params)).rows;

  beforeAll(() => db.connect());
  afterAll(() => db.end());
  beforeEach(async () => {
    await db.query('BEGIN');
    // Pre-ledger data: written around the stage 2 ledger triggers.
    await db.query(`SELECT set_config('konkurent.stock_ledger', 'bypass', true)`);
    await db.query(`
      INSERT INTO "Company" (id, login, name, subdomain, "updatedAt") VALUES
        ('${COMPANY}', '${COMPANY}', 'R', '${COMPANY}', now());
      INSERT INTO "Shop" (id, "companyId", name, "branchCode", "updatedAt") VALUES
        ('r-s1', '${COMPANY}', 'S1', 'R1', now()),
        ('r-s2', '${COMPANY}', 'S2', 'R2', now());
      INSERT INTO "ProductColor" (id, "companyId", name, "updatedAt") VALUES
        ('r-red', '${COMPANY}', 'Red', now()), ('r-blue', '${COMPANY}', 'Blue', now());
      INSERT INTO "Product" (id, "publicId", "companyId", name, quantity, barcode, "salePrice", "updatedAt") VALUES
        (910001, 'r-p1', '${COMPANY}', 'Simple stale', 5, 'B1', 10, now()),
        (910002, 'r-p2', '${COMPANY}', 'No variant', 2, 'B2', 20, now()),
        (910003, 'r-p3', '${COMPANY}', 'Barcode clash', 0, 'DUP', 30, now()),
        (910004, 'r-p4', '${COMPANY}', 'Owner of DUP', 0, NULL, 40, now()),
        (910005, 'r-p5', '${COMPANY}', 'Axis under', 0, NULL, 50, now()),
        (910006, 'r-p6', '${COMPANY}', 'Axis over', 4, NULL, 60, now());
      INSERT INTO "ProductVariant" (id, "companyId", "productId", "colorId", barcode, "isDefault", "isActive", "updatedAt") VALUES
        ('r-v1', '${COMPANY}', 910001, NULL, 'B1', true, true, now()),
        ('r-v4', '${COMPANY}', 910004, NULL, 'DUP', true, true, now()),
        ('r-v5r', '${COMPANY}', 910005, 'r-red', NULL, false, true, now()),
        ('r-v5b', '${COMPANY}', 910005, 'r-blue', NULL, false, true, now()),
        ('r-v6', '${COMPANY}', 910006, 'r-red', NULL, false, true, now());
      INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity, "salePrice", "updatedAt") VALUES
        (910001, 'r-s1', 'R1', 5, 10, now()),
        (910002, 'r-s1', 'R1', 2, 20, now()),
        (910005, 'r-s1', 'R1', 0, NULL, now()),
        (910006, 'r-s1', 'R1', 4, NULL, now());
      INSERT INTO "ProductVariantStock" (id, "companyId", "variantId", "shopId", "branchCode", quantity, "updatedAt") VALUES
        ('r-vs1', '${COMPANY}', 'r-v1', 'r-s1', 'R1', 8, now()),
        ('r-vs1b', '${COMPANY}', 'r-v1', 'r-s2', 'R2', 3, now()),
        ('r-vs5r', '${COMPANY}', 'r-v5r', 'r-s1', 'R1', 2, now()),
        ('r-vs5b', '${COMPANY}', 'r-v5b', 'r-s1', 'R1', 3, now()),
        ('r-vs6', '${COMPANY}', 'r-v6', 'r-s1', 'R1', 1, now());
    `);
    await db.query(`SELECT set_config('konkurent.stock_ledger', '', true)`);
  });
  afterEach(() => db.query('ROLLBACK'));

  const variantStock = async (productId: number) =>
    (
      await db.query(
        `SELECT vs."shopId", vs.quantity FROM "ProductVariantStock" vs
         JOIN "ProductVariant" v ON v.id = vs."variantId"
         WHERE v."productId" = $1 ORDER BY vs."shopId"`,
        [productId],
      )
    ).rows;
  const productStock = async (productId: number) =>
    (
      await db.query(
        `SELECT "shopId", quantity FROM "ProductStock" WHERE "productId" = $1 ORDER BY "shopId"`,
        [productId],
      )
    ).rows;

  it('reports every class of inconsistency before the repair', async () => {
    const report = await auditVariantReadiness(sql, COMPANY);

    expect(report).toMatchObject({
      productsWithoutVariant: 2,
      barcodeCollisions: 1,
      simpleStockMismatches: 2,
      axisStockBelowVariants: 1,
      axisStockAboveVariants: 1,
      productTotalMismatches: 0,
    });
  });

  it('repairs unambiguous cases and leaves oversold sizes for a count', async () => {
    const repair = await repairVariantReadiness(sql, COMPANY);

    expect(repair).toEqual({
      defaultVariantsCreated: 2,
      defaultVariantBarcodesDropped: 1,
      simpleStockRowsSynced: 3,
      axisStockRowsRaised: 1,
      productTotalsSynced: 1,
    });
    // Simple product: variant ledger follows ProductStock in every shop.
    expect(await variantStock(910001)).toEqual([
      { shopId: 'r-s1', quantity: 5 },
      { shopId: 'r-s2', quantity: 0 },
    ]);
    expect(await variantStock(910002)).toEqual([
      { shopId: 'r-s1', quantity: 2 },
    ]);
    const [clash] = (
      await db.query(
        `SELECT barcode, "isDefault" FROM "ProductVariant" WHERE "productId" = 910003`,
      )
    ).rows;
    expect(clash).toEqual({ barcode: null, isDefault: true });
    // Axis products: raised to the size sum, oversold one untouched.
    expect(await productStock(910005)).toEqual([
      { shopId: 'r-s1', quantity: 5 },
    ]);
    expect(await productStock(910006)).toEqual([
      { shopId: 'r-s1', quantity: 4 },
    ]);
    const [{ quantity }] = (
      await db.query(`SELECT quantity FROM "Product" WHERE id = 910005`)
    ).rows;
    expect(quantity).toBe(5);

    expect(await auditVariantReadiness(sql, COMPANY)).toMatchObject({
      productsWithoutVariant: 0,
      simpleStockMismatches: 0,
      axisStockBelowVariants: 0,
      axisStockAboveVariants: 1,
      productTotalMismatches: 0,
    });
  });

  it('is idempotent', async () => {
    await repairVariantReadiness(sql, COMPANY);

    expect(await repairVariantReadiness(sql, COMPANY)).toEqual({
      defaultVariantsCreated: 0,
      defaultVariantBarcodesDropped: 0,
      simpleStockRowsSynced: 0,
      axisStockRowsRaised: 0,
      productTotalsSynced: 0,
    });
  });
});
