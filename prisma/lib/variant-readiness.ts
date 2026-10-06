// Stage 0 of the Product -> ProductVariant migration: measure and repair the
// catalog so that every product has a variant ledger that matches ProductStock.
//
// A product is an "axis" product when it has an active colour/size variant;
// otherwise it is a "simple" product whose stock lives on its default variant.
// Every function takes a plain SQL runner so the same code is used by the CLI
// (prisma/audit-variant-readiness.ts) and by the PostgreSQL integration tests.

export type SqlRunner = (text: string, params?: unknown[]) => Promise<any[]>;

const AXIS_PRODUCT = `EXISTS (
  SELECT 1 FROM "ProductVariant" av
  WHERE av."productId" = p.id AND av."isActive"
    AND (av."colorId" IS NOT NULL OR av."sizeId" IS NOT NULL))`;

const COMPANY_FILTER = `($1::text IS NULL OR p."companyId" = $1)`;

export type VariantReadinessReport = {
  productsWithoutCompany: number;
  salesWithoutCompany: number;
  productsWithoutVariant: number;
  simpleProductsWithoutDefaultVariant: number;
  productsWithSeveralDefaultVariants: number;
  variantCompanyMismatches: number;
  axisProductsWithActiveDefaultVariant: number;
  duplicateAxisCombinations: number;
  barcodeCollisions: number;
  simpleStockMismatches: number;
  axisStockBelowVariants: number;
  axisStockAboveVariants: number;
  productTotalMismatches: number;
  legacyAxesWithoutAttributes: number;
  rowsWithoutVariant: Record<string, number>;
};

async function count(sql: SqlRunner, text: string, companyId: string | null) {
  const [row] = await sql(`SELECT count(*)::int AS n FROM (${text}) q`, [
    companyId,
  ]);
  return Number(row?.n ?? 0);
}

// Simple products: default-variant stock per shop vs ProductStock.
const SIMPLE_STOCK_MISMATCH = `
  SELECT p.id, ps."shopId"
  FROM "Product" p
  JOIN "ProductVariant" dv ON dv."productId" = p.id AND dv."isDefault"
  JOIN "ProductStock" ps ON ps."productId" = p.id
  LEFT JOIN "ProductVariantStock" vs
    ON vs."variantId" = dv.id AND vs."shopId" = ps."shopId"
  WHERE ${COMPANY_FILTER} AND NOT ${AXIS_PRODUCT}
    AND COALESCE(vs.quantity, 0) <> ps.quantity
  UNION
  SELECT p.id, vs."shopId"
  FROM "Product" p
  JOIN "ProductVariant" dv ON dv."productId" = p.id AND dv."isDefault"
  JOIN "ProductVariantStock" vs ON vs."variantId" = dv.id
  WHERE ${COMPANY_FILTER} AND NOT ${AXIS_PRODUCT} AND vs.quantity <> 0
    AND NOT EXISTS (SELECT 1 FROM "ProductStock" ps
      WHERE ps."productId" = p.id AND ps."shopId" = vs."shopId")`;

// Axis products: ProductStock per shop vs the sum of active variant stocks.
const AXIS_STOCK = `
  WITH variant_sum AS (
    SELECT v."productId", vs."shopId", min(vs."branchCode") AS "branchCode",
           sum(vs.quantity) AS quantity
    FROM "ProductVariant" v
    JOIN "ProductVariantStock" vs ON vs."variantId" = v.id
    WHERE v."isActive" AND (v."colorId" IS NOT NULL OR v."sizeId" IS NOT NULL)
    GROUP BY v."productId", vs."shopId"
  ), shop_keys AS (
    SELECT "productId", "shopId" FROM variant_sum
    UNION SELECT "productId", "shopId" FROM "ProductStock"
  )
  SELECT p.id, k."shopId",
         COALESCE(ps."branchCode", s."branchCode") AS "branchCode",
         COALESCE(ps.quantity, 0) AS product_quantity,
         COALESCE(s.quantity, 0) AS variant_quantity
  FROM "Product" p
  JOIN shop_keys k ON k."productId" = p.id
  LEFT JOIN "ProductStock" ps ON ps."productId" = p.id AND ps."shopId" = k."shopId"
  LEFT JOIN variant_sum s ON s."productId" = p.id AND s."shopId" = k."shopId"
  WHERE ${COMPANY_FILTER} AND ${AXIS_PRODUCT}`;

const PRODUCT_TOTAL_MISMATCH = `
  SELECT p.id FROM "Product" p
  WHERE ${COMPANY_FILTER} AND p.quantity <> COALESCE(
    (SELECT sum(ps.quantity) FROM "ProductStock" ps WHERE ps."productId" = p.id), 0)`;

const VARIANT_ROW_TABLES = [
  'SaleItem',
  'StockMovement',
  'TransferItem',
  'InventoryItem',
] as const;

export async function auditVariantReadiness(
  sql: SqlRunner,
  companyId: string | null = null,
): Promise<VariantReadinessReport> {
  const rowsWithoutVariant: Record<string, number> = {};
  for (const table of VARIANT_ROW_TABLES) {
    rowsWithoutVariant[table] = await count(
      sql,
      `SELECT 1 FROM "${table}" t JOIN "Product" p ON p.id = t."productId"
       WHERE ${COMPANY_FILTER} AND t."variantId" IS NULL`,
      companyId,
    );
  }

  return {
    productsWithoutCompany: await count(
      sql,
      `SELECT 1 FROM "Product" p WHERE p."companyId" IS NULL AND $1::text IS NULL`,
      companyId,
    ),
    salesWithoutCompany: await count(
      sql,
      `SELECT 1 FROM "Sale" s WHERE s."companyId" IS NULL AND $1::text IS NULL`,
      companyId,
    ),
    productsWithoutVariant: await count(
      sql,
      `SELECT 1 FROM "Product" p WHERE p."companyId" IS NOT NULL AND ${COMPANY_FILTER}
       AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)`,
      companyId,
    ),
    simpleProductsWithoutDefaultVariant: await count(
      sql,
      `SELECT 1 FROM "Product" p WHERE ${COMPANY_FILTER} AND NOT ${AXIS_PRODUCT}
       AND EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)
       AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v
         WHERE v."productId" = p.id AND v."isDefault")`,
      companyId,
    ),
    productsWithSeveralDefaultVariants: await count(
      sql,
      `SELECT 1 FROM "Product" p JOIN "ProductVariant" v ON v."productId" = p.id
       WHERE ${COMPANY_FILTER} AND v."isDefault" GROUP BY p.id HAVING count(*) > 1`,
      companyId,
    ),
    variantCompanyMismatches: await count(
      sql,
      `SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
       WHERE ${COMPANY_FILTER} AND v."companyId" IS DISTINCT FROM p."companyId"`,
      companyId,
    ),
    axisProductsWithActiveDefaultVariant: await count(
      sql,
      `SELECT 1 FROM "Product" p JOIN "ProductVariant" v ON v."productId" = p.id
       WHERE ${COMPANY_FILTER} AND ${AXIS_PRODUCT} AND v."isDefault" AND v."isActive"`,
      companyId,
    ),
    duplicateAxisCombinations: await count(
      sql,
      `SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
       WHERE ${COMPANY_FILTER} AND v."isActive"
         AND (v."colorId" IS NOT NULL OR v."sizeId" IS NOT NULL)
       GROUP BY v."productId", v."colorId", v."sizeId" HAVING count(*) > 1`,
      companyId,
    ),
    barcodeCollisions: await count(
      sql,
      `SELECT 1 FROM "Product" p
       JOIN "ProductVariant" v ON v."companyId" = p."companyId"
         AND v.barcode = p.barcode AND v."productId" <> p.id
       WHERE ${COMPANY_FILTER} AND p.barcode IS NOT NULL`,
      companyId,
    ),
    simpleStockMismatches: await count(sql, SIMPLE_STOCK_MISMATCH, companyId),
    axisStockBelowVariants: await count(
      sql,
      `SELECT 1 FROM (${AXIS_STOCK}) a WHERE a.product_quantity < a.variant_quantity`,
      companyId,
    ),
    axisStockAboveVariants: await count(
      sql,
      `SELECT 1 FROM (${AXIS_STOCK}) a WHERE a.product_quantity > a.variant_quantity`,
      companyId,
    ),
    productTotalMismatches: await count(sql, PRODUCT_TOTAL_MISMATCH, companyId),
    // Stage 1 mirror check: colour/size set on a variant but not mirrored.
    legacyAxesWithoutAttributes: await count(
      sql,
      `SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
       WHERE ${COMPANY_FILTER}
         AND ((v."colorId" IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM "VariantAttributeValue" vav
               JOIN "AttributeOption" o ON o.id = vav."optionId"
               WHERE vav."variantId" = v.id AND o."legacyColorId" = v."colorId"))
           OR (v."sizeId" IS NOT NULL AND NOT EXISTS (
               SELECT 1 FROM "VariantAttributeValue" vav
               JOIN "AttributeOption" o ON o.id = vav."optionId"
               WHERE vav."variantId" = v.id AND o."legacySizeId" = v."sizeId")))`,
      companyId,
    ),
    rowsWithoutVariant,
  };
}

export type VariantReadinessRepair = {
  defaultVariantsCreated: number;
  defaultVariantBarcodesDropped: number;
  simpleStockRowsSynced: number;
  axisStockRowsRaised: number;
  productTotalsSynced: number;
};

// Repairs only cases with an unambiguous answer. Must run inside one
// transaction (the caller commits); stock tables are locked so live sales
// cannot interleave with the repair.
export async function repairVariantReadiness(
  sql: SqlRunner,
  companyId: string | null = null,
): Promise<VariantReadinessRepair> {
  await sql(
    `LOCK TABLE "ProductStock", "ProductVariantStock", "ProductVariant", "Product"
     IN SHARE ROW EXCLUSIVE MODE`,
  );

  // 1. Every product gets a default variant. A barcode/SKU already used by
  // another variant of the company is not copied (unique per company).
  const created = await sql(
    `INSERT INTO "ProductVariant" (id, "companyId", "productId", barcode, sku,
       "purchasePrice", "salePrice", "attributeValues", "isDefault", "isActive",
       "createdAt", "updatedAt")
     SELECT gen_random_uuid()::text, p."companyId", p.id,
       CASE WHEN EXISTS (SELECT 1 FROM "ProductVariant" o
         WHERE o."companyId" = p."companyId" AND o.barcode = p.barcode)
         THEN NULL ELSE p.barcode END,
       CASE WHEN EXISTS (SELECT 1 FROM "ProductVariant" o
         WHERE o."companyId" = p."companyId" AND o.sku = p.sku)
         THEN NULL ELSE p.sku END,
       p."purchasePrice", p."salePrice", '{}'::jsonb, true,
       p."archivedAt" IS NULL, now(), now()
     FROM "Product" p
     WHERE p."companyId" IS NOT NULL AND ${COMPANY_FILTER}
       AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id)
     RETURNING id, barcode, "productId"`,
    [companyId],
  );
  const createdProductIds = created.map((row) => Number(row.productId));
  const droppedBarcodes = createdProductIds.length
    ? await sql(
        `SELECT 1 FROM "ProductVariant" v JOIN "Product" p ON p.id = v."productId"
         WHERE v.id = ANY($1::text[]) AND p.barcode IS NOT NULL AND v.barcode IS NULL`,
        [created.map((row) => row.id)],
      )
    : [];

  // 2. Simple products: ProductStock is what every stock path has been
  // writing, so the default variant stock is brought in line with it.
  const synced = await sql(
    `INSERT INTO "ProductVariantStock" (id, "companyId", "variantId", "shopId",
       "branchCode", quantity, "purchasePrice", "salePrice", "lowStockNotifiedAt",
       "createdAt", "updatedAt")
     SELECT gen_random_uuid()::text, p."companyId", dv.id, ps."shopId",
       ps."branchCode", ps.quantity, ps."purchasePrice", ps."salePrice",
       ps."lowStockNotifiedAt", now(), now()
     FROM "Product" p
     JOIN "ProductVariant" dv ON dv."productId" = p.id AND dv."isDefault"
     JOIN "ProductStock" ps ON ps."productId" = p.id
     WHERE ${COMPANY_FILTER} AND NOT ${AXIS_PRODUCT}
       AND (SELECT count(*) FROM "ProductVariant" d
            WHERE d."productId" = p.id AND d."isDefault") = 1
     ON CONFLICT ("variantId", "shopId") DO UPDATE SET
       quantity = EXCLUDED.quantity,
       "purchasePrice" = EXCLUDED."purchasePrice",
       "salePrice" = EXCLUDED."salePrice",
       "updatedAt" = now()
     WHERE "ProductVariantStock".quantity IS DISTINCT FROM EXCLUDED.quantity
        OR "ProductVariantStock"."purchasePrice" IS DISTINCT FROM EXCLUDED."purchasePrice"
        OR "ProductVariantStock"."salePrice" IS DISTINCT FROM EXCLUDED."salePrice"
     RETURNING id`,
    [companyId],
  );
  const zeroed = await sql(
    `UPDATE "ProductVariantStock" vs SET quantity = 0, "updatedAt" = now()
     FROM "ProductVariant" dv JOIN "Product" p ON p.id = dv."productId"
     WHERE vs."variantId" = dv.id AND dv."isDefault" AND vs.quantity <> 0
       AND ${COMPANY_FILTER} AND NOT ${AXIS_PRODUCT}
       AND NOT EXISTS (SELECT 1 FROM "ProductStock" ps
         WHERE ps."productId" = p.id AND ps."shopId" = vs."shopId")
     RETURNING vs.id`,
    [companyId],
  );

  // 3. Axis products: ProductStock below the variant sum is the old catalog
  // form bug (variants hold what the user entered). ProductStock above the
  // sum means sales without a size — left for a stock count.
  const raised = await sql(
    `INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity,
       "createdAt", "updatedAt")
     SELECT a.id, a."shopId", a."branchCode", a.variant_quantity, now(), now()
     FROM (${AXIS_STOCK}) a WHERE a.product_quantity < a.variant_quantity
     ON CONFLICT ("productId", "shopId") DO UPDATE SET
       quantity = EXCLUDED.quantity, "updatedAt" = now()
     RETURNING id`,
    [companyId],
  );

  // 4. Product.quantity is the sum of its shop stocks.
  const totals = await sql(
    `UPDATE "Product" SET quantity = COALESCE(
       (SELECT sum(ps.quantity) FROM "ProductStock" ps
        WHERE ps."productId" = "Product".id), 0)
     WHERE id IN (${PRODUCT_TOTAL_MISMATCH})
     RETURNING id`,
    [companyId],
  );

  return {
    defaultVariantsCreated: created.length,
    defaultVariantBarcodesDropped: droppedBarcodes.length,
    simpleStockRowsSynced: synced.length + zeroed.length,
    axisStockRowsRaised: raised.length,
    productTotalsSynced: totals.length,
  };
}
