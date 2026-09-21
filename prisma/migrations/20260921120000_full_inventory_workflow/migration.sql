BEGIN;

ALTER TYPE "StockMovementType" ADD VALUE IF NOT EXISTS 'INVENTORY_ADJUSTMENT';

ALTER TABLE "InventorySession"
  ADD COLUMN "number" TEXT,
  ADD COLUMN "type" TEXT NOT NULL DEFAULT 'FULL',
  ADD COLUMN "countMode" TEXT NOT NULL DEFAULT 'BLIND',
  ADD COLUMN "lockStockOperations" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "scopeJson" JSONB,
  ADD COLUMN "responsibleUserIds" JSONB,
  ADD COLUMN "snapshotAt" TIMESTAMP(3),
  ADD COLUMN "startedById" INTEGER,
  ADD COLUMN "startedAt" TIMESTAMP(3),
  ADD COLUMN "submittedById" INTEGER,
  ADD COLUMN "submittedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "canceledById" INTEGER,
  ADD COLUMN "canceledAt" TIMESTAMP(3),
  ADD COLUMN "cancelReason" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

UPDATE "InventorySession"
SET "number" = 'INV-' || UPPER(SUBSTRING(REPLACE("id", '-', ''), 1, 10)),
    "status" = CASE
      WHEN LOWER("status") = 'completed' THEN 'COMPLETED'
      WHEN LOWER("status") = 'applying' THEN 'REVIEW'
      ELSE 'DRAFT'
    END;
ALTER TABLE "InventorySession" ALTER COLUMN "number" SET NOT NULL;
CREATE UNIQUE INDEX "InventorySession_companyId_number_key" ON "InventorySession"("companyId", "number");
CREATE UNIQUE INDEX "InventorySession_one_active_full_per_shop_key"
  ON "InventorySession"("shopId")
  WHERE "type" = 'FULL' AND "status" IN ('COUNTING', 'REVIEW', 'RECOUNT_REQUIRED');

ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_startedById_fkey" FOREIGN KEY ("startedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_submittedById_fkey" FOREIGN KEY ("submittedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventorySession" ADD CONSTRAINT "InventorySession_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryItem"
  ADD COLUMN "sku" TEXT,
  ADD COLUMN "barcode" TEXT,
  ADD COLUMN "systemQuantitySnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "expectedQuantityAtCount" DOUBLE PRECISION,
  ADD COLUMN "countedQuantity" DOUBLE PRECISION,
  ADD COLUMN "differenceQuantity" DOUBLE PRECISION,
  ADD COLUMN "adjustmentDelta" DOUBLE PRECISION,
  ADD COLUMN "costPriceSnapshot" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "differenceAmount" DOUBLE PRECISION,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'NOT_COUNTED',
  ADD COLUMN "reasonCode" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "countedById" INTEGER,
  ADD COLUMN "countedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" INTEGER,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "InventoryItem" SET
  "systemQuantitySnapshot" = "expectedQuantity",
  "expectedQuantityAtCount" = "expectedQuantity",
  "countedQuantity" = "actualQuantity",
  "differenceQuantity" = "difference",
  "adjustmentDelta" = "difference",
  "differenceAmount" = 0,
  "status" = CASE WHEN "difference" < 0 THEN 'SHORTAGE' WHEN "difference" > 0 THEN 'SURPLUS' ELSE 'MATCHED' END;
ALTER TABLE "InventoryItem" DROP COLUMN "expectedQuantity", DROP COLUMN "actualQuantity", DROP COLUMN "difference";
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "InventoryItem_session_product_without_variant_key"
  ON "InventoryItem"("inventorySessionId", "productId") WHERE "variantId" IS NULL;

CREATE TABLE "InventoryCountAttempt" (
  "id" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "attemptNumber" INTEGER NOT NULL,
  "countedQuantity" DOUBLE PRECISION NOT NULL,
  "countedById" INTEGER NOT NULL,
  "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "isFinal" BOOLEAN NOT NULL DEFAULT true,
  CONSTRAINT "InventoryCountAttempt_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryCountAttempt_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "InventoryCountAttempt_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "InventoryCountAttempt_inventoryItemId_attemptNumber_key" ON "InventoryCountAttempt"("inventoryItemId", "attemptNumber");
CREATE INDEX "InventoryCountAttempt_inventoryItemId_countedAt_idx" ON "InventoryCountAttempt"("inventoryItemId", "countedAt");

ALTER TABLE "StockMovement"
  ADD COLUMN "variantId" TEXT,
  ADD COLUMN "referenceType" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "referenceId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "StockMovement_variantId_idx" ON "StockMovement"("variantId");
CREATE INDEX "StockMovement_referenceType_referenceId_idx" ON "StockMovement"("referenceType", "referenceId");

COMMIT;
