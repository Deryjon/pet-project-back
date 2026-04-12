ALTER TABLE "Category" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Brand" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "companyId" TEXT;
ALTER TABLE "Sale" ADD COLUMN "companyId" TEXT;

UPDATE "Category" c
SET "companyId" = resolved.company_id
FROM (
  SELECT p."categoryId" AS category_id, MIN(p."companyId") AS company_id
  FROM "Product" p
  WHERE p."categoryId" IS NOT NULL
    AND p."companyId" IS NOT NULL
  GROUP BY p."categoryId"
  HAVING COUNT(DISTINCT p."companyId") = 1
) resolved
WHERE c."id" = resolved.category_id
  AND c."companyId" IS NULL;

UPDATE "Brand" b
SET "companyId" = resolved.company_id
FROM (
  SELECT p."brandId" AS brand_id, MIN(p."companyId") AS company_id
  FROM "Product" p
  WHERE p."brandId" IS NOT NULL
    AND p."companyId" IS NOT NULL
  GROUP BY p."brandId"
  HAVING COUNT(DISTINCT p."companyId") = 1
) resolved
WHERE b."id" = resolved.brand_id
  AND b."companyId" IS NULL;

WITH supplier_company AS (
  SELECT ps."supplierId" AS supplier_id, MIN(p."companyId") AS company_id
  FROM "ProductSupplier" ps
  JOIN "Product" p ON p."id" = ps."productId"
  WHERE p."companyId" IS NOT NULL
  GROUP BY ps."supplierId"
  HAVING COUNT(DISTINCT p."companyId") = 1
)
UPDATE "Supplier" s
SET "companyId" = sc.company_id
FROM supplier_company sc
WHERE s."id" = sc.supplier_id
  AND s."companyId" IS NULL;

UPDATE "Sale" s
SET "companyId" = u."companyId"
FROM "User" u
WHERE s."userId" = u."id"
  AND u."companyId" IS NOT NULL
  AND s."companyId" IS NULL;

WITH sale_company_by_branch AS (
  SELECT s."id" AS sale_id, MIN(sh."companyId") AS company_id
  FROM "Sale" s
  JOIN "Shop" sh ON sh."branchCode" = s."branchCode"
  GROUP BY s."id"
  HAVING COUNT(DISTINCT sh."companyId") = 1
)
UPDATE "Sale" s
SET "companyId" = sc.company_id
FROM sale_company_by_branch sc
WHERE s."id" = sc.sale_id
  AND s."companyId" IS NULL;

WITH first_company AS (
  SELECT "id" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Category" c
SET "companyId" = fc."id"
FROM first_company fc
WHERE c."companyId" IS NULL;

WITH first_company AS (
  SELECT "id" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Brand" b
SET "companyId" = fc."id"
FROM first_company fc
WHERE b."companyId" IS NULL;

WITH first_company AS (
  SELECT "id" FROM "Company" ORDER BY "createdAt" ASC LIMIT 1
)
UPDATE "Supplier" s
SET "companyId" = fc."id"
FROM first_company fc
WHERE s."companyId" IS NULL;

ALTER TABLE "Category" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Brand" ALTER COLUMN "companyId" SET NOT NULL;
ALTER TABLE "Supplier" ALTER COLUMN "companyId" SET NOT NULL;

DROP INDEX IF EXISTS "Category_name_key";
DROP INDEX IF EXISTS "Brand_name_key";
DROP INDEX IF EXISTS "Supplier_name_key";
DROP INDEX IF EXISTS "Product_sku_key";
DROP INDEX IF EXISTS "Product_barcode_key";

CREATE INDEX "Category_companyId_idx" ON "Category"("companyId");
CREATE INDEX "Brand_companyId_idx" ON "Brand"("companyId");
CREATE INDEX "Supplier_companyId_idx" ON "Supplier"("companyId");
CREATE INDEX "Sale_companyId_idx" ON "Sale"("companyId");

CREATE UNIQUE INDEX "Category_companyId_name_key" ON "Category"("companyId", "name");
CREATE UNIQUE INDEX "Brand_companyId_name_key" ON "Brand"("companyId", "name");
CREATE UNIQUE INDEX "Supplier_companyId_name_key" ON "Supplier"("companyId", "name");
CREATE UNIQUE INDEX "Product_companyId_sku_key" ON "Product"("companyId", "sku");
CREATE UNIQUE INDEX "Product_companyId_barcode_key" ON "Product"("companyId", "barcode");

ALTER TABLE "Category"
ADD CONSTRAINT "Category_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Brand"
ADD CONSTRAINT "Brand_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Supplier"
ADD CONSTRAINT "Supplier_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
