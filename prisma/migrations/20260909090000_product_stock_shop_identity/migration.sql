DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "ProductStock"
    GROUP BY "productId", "branchCode"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION
      'ProductStock contains duplicate productId/branchCode rows; repair them before applying this migration';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "ProductStock" ps
    JOIN "Product" p ON p.id = ps."productId"
    LEFT JOIN "Shop" s
      ON s."companyId" = p."companyId"
     AND s."branchCode" = ps."branchCode"
    WHERE s.id IS NULL
  ) THEN
    RAISE EXCEPTION
      'ProductStock contains rows without a matching shop in the product company';
  END IF;
END $$;

ALTER TABLE "ProductStock" ADD COLUMN "shopId" TEXT;

UPDATE "ProductStock" ps
SET "shopId" = s.id
FROM "Product" p
JOIN "Shop" s ON s."companyId" = p."companyId"
WHERE p.id = ps."productId"
  AND s."branchCode" = ps."branchCode";

ALTER TABLE "ProductStock" ALTER COLUMN "shopId" SET NOT NULL;

CREATE UNIQUE INDEX "ProductStock_productId_shopId_key"
  ON "ProductStock"("productId", "shopId");
CREATE UNIQUE INDEX "ProductStock_productId_branchCode_key"
  ON "ProductStock"("productId", "branchCode");
CREATE INDEX "ProductStock_shopId_idx" ON "ProductStock"("shopId");

ALTER TABLE "ProductStock"
  ADD CONSTRAINT "ProductStock_shopId_fkey"
  FOREIGN KEY ("shopId") REFERENCES "Shop"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
