ALTER TABLE "Product"
ADD COLUMN "companyId" TEXT;

UPDATE "Product"
SET "companyId" = NULLIF("metadata"->>'company_id', '')
WHERE "companyId" IS NULL
  AND "metadata" IS NOT NULL;

WITH uniquely_resolved_products AS (
  SELECT
    ps."productId" AS product_id,
    MIN(s."companyId") AS company_id
  FROM "ProductStock" ps
  JOIN "Shop" s
    ON s."branchCode" = ps."branchCode"
  GROUP BY ps."productId"
  HAVING COUNT(DISTINCT s."companyId") = 1
)
UPDATE "Product" p
SET "companyId" = urp.company_id
FROM uniquely_resolved_products urp
WHERE p."id" = urp.product_id
  AND p."companyId" IS NULL;

CREATE INDEX "Product_companyId_idx" ON "Product"("companyId");

ALTER TABLE "Product"
ADD CONSTRAINT "Product_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
