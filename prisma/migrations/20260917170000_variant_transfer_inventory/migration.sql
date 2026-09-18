ALTER TABLE "TransferItem" ADD COLUMN "variantId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "variantId" TEXT;

DROP INDEX "TransferItem_transferId_productId_key";
DROP INDEX "InventoryItem_inventorySessionId_productId_key";

CREATE UNIQUE INDEX "TransferItem_transferId_productId_variantId_key"
ON "TransferItem"("transferId", "productId", "variantId");
CREATE UNIQUE INDEX "InventoryItem_inventorySessionId_productId_variantId_key"
ON "InventoryItem"("inventorySessionId", "productId", "variantId");
CREATE UNIQUE INDEX "TransferItem_transferId_productId_legacy_key"
ON "TransferItem"("transferId", "productId") WHERE "variantId" IS NULL;
CREATE UNIQUE INDEX "InventoryItem_inventorySessionId_productId_legacy_key"
ON "InventoryItem"("inventorySessionId", "productId") WHERE "variantId" IS NULL;
CREATE INDEX "TransferItem_variantId_idx" ON "TransferItem"("variantId");
CREATE INDEX "InventoryItem_variantId_idx" ON "InventoryItem"("variantId");

ALTER TABLE "TransferItem" ADD CONSTRAINT "TransferItem_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_variantId_fkey"
FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
