-- AlterTable
ALTER TABLE "StockMovement"
ADD COLUMN "displayTypeCode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "displayTypeLabel" TEXT NOT NULL DEFAULT '',
ADD COLUMN "externalId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "loadedMeasurementValue" DECIMAL(12,3) NOT NULL DEFAULT 0,
ADD COLUMN "fromShopId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "toShopId" TEXT NOT NULL DEFAULT '',
ADD COLUMN "supplyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "retailPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "newRetailPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "fromRetailPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN "fromSupplyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Backfill existing StockMovement rows
UPDATE "StockMovement" sm
SET
  "displayTypeCode" = CASE
    WHEN sm."type" = 'PURCHASE' THEN 'import'
    WHEN sm."type" = 'TRANSFER' THEN 'transfer'
    WHEN sm."type" = 'WRITE_OFF' THEN 'write_off'
    WHEN sm."type" = 'RETURN' THEN 'return'
    ELSE 'sale'
  END,
  "displayTypeLabel" = CASE
    WHEN sm."type" = 'PURCHASE' THEN 'Импорт'
    WHEN sm."type" = 'TRANSFER' THEN 'Трансфер'
    WHEN sm."type" = 'WRITE_OFF' THEN 'Списание'
    WHEN sm."type" = 'RETURN' THEN 'Возврат'
    ELSE 'Продажа'
  END,
  "externalId" = COALESCE(
    (SELECT o."orderNumber" FROM "Order" o WHERE o."id" = sm."orderId"),
    ''
  ),
  "loadedMeasurementValue" = sm."afterQuantity",
  "fromShopId" = sm."shopId",
  "toShopId" = sm."shopId",
  "supplyPrice" = COALESCE(
    (SELECT p."purchasePrice" FROM "Product" p WHERE p."id" = sm."productId"),
    0
  ),
  "retailPrice" = COALESCE(
    (SELECT p."salePrice" FROM "Product" p WHERE p."id" = sm."productId"),
    0
  ),
  "newRetailPrice" = COALESCE(
    (SELECT p."salePrice" FROM "Product" p WHERE p."id" = sm."productId"),
    0
  ),
  "fromRetailPrice" = COALESCE(
    (SELECT p."salePrice" FROM "Product" p WHERE p."id" = sm."productId"),
    0
  ),
  "fromSupplyPrice" = COALESCE(
    (SELECT p."purchasePrice" FROM "Product" p WHERE p."id" = sm."productId"),
    0
  );

-- CreateTable
CREATE TABLE "ProductSupplyPriceHistory" (
  "id" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "shopId" TEXT NOT NULL,
  "supplyPrice" DECIMAL(12,2) NOT NULL,
  "supplyCurrency" TEXT NOT NULL DEFAULT '',
  "oldSupplyPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ProductSupplyPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSupplyPriceHistory_productId_createdAt_idx"
ON "ProductSupplyPriceHistory"("productId", "createdAt");

-- CreateIndex
CREATE INDEX "ProductSupplyPriceHistory_shopId_createdAt_idx"
ON "ProductSupplyPriceHistory"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "ProductSupplyPriceHistory"
ADD CONSTRAINT "ProductSupplyPriceHistory_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplyPriceHistory"
ADD CONSTRAINT "ProductSupplyPriceHistory_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplyPriceHistory"
ADD CONSTRAINT "ProductSupplyPriceHistory_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill initial supply price history from current stock rows
INSERT INTO "ProductSupplyPriceHistory" (
  "id",
  "productId",
  "shopId",
  "supplyPrice",
  "supplyCurrency",
  "oldSupplyPrice",
  "createdAt"
)
SELECT
  md5(random()::text || clock_timestamp()::text || ps."productId"::text || s."id"),
  ps."productId",
  s."id",
  COALESCE(ps."purchasePrice", 0),
  '',
  0,
  CURRENT_TIMESTAMP
FROM "ProductStock" ps
JOIN "Product" p ON p."id" = ps."productId"
JOIN "Shop" s ON s."companyId" = p."companyId" AND s."branchCode" = ps."branchCode"
WHERE ps."purchasePrice" IS NOT NULL;
