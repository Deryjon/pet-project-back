CREATE TYPE "TransferStatus" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'CANCELLED');

CREATE TABLE "Transfer" (
  "id" TEXT NOT NULL,
  "externalId" INTEGER,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "departureShopId" TEXT NOT NULL,
  "arrivalShopId" TEXT NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'DRAFT',
  "createdById" INTEGER NOT NULL,
  "acceptedById" INTEGER,
  "comment" TEXT NOT NULL DEFAULT '',
  "useDepartureShopPrices" BOOLEAN NOT NULL DEFAULT false,
  "sentAt" TIMESTAMP(3),
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TransferItem" (
  "id" TEXT NOT NULL,
  "transferId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "quantity" DECIMAL(12,3) NOT NULL,
  "arrivedQuantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TransferItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Transfer_externalId_key" ON "Transfer"("externalId");
CREATE INDEX "Transfer_companyId_createdAt_idx" ON "Transfer"("companyId", "createdAt");
CREATE INDEX "Transfer_departureShopId_idx" ON "Transfer"("departureShopId");
CREATE INDEX "Transfer_arrivalShopId_idx" ON "Transfer"("arrivalShopId");
CREATE INDEX "Transfer_status_idx" ON "Transfer"("status");

CREATE UNIQUE INDEX "TransferItem_transferId_productId_key" ON "TransferItem"("transferId", "productId");
CREATE INDEX "TransferItem_transferId_idx" ON "TransferItem"("transferId");
CREATE INDEX "TransferItem_productId_idx" ON "TransferItem"("productId");

ALTER TABLE "Transfer"
ADD CONSTRAINT "Transfer_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Transfer"
ADD CONSTRAINT "Transfer_departureShopId_fkey"
FOREIGN KEY ("departureShopId") REFERENCES "Shop"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Transfer"
ADD CONSTRAINT "Transfer_arrivalShopId_fkey"
FOREIGN KEY ("arrivalShopId") REFERENCES "Shop"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Transfer"
ADD CONSTRAINT "Transfer_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "Transfer"
ADD CONSTRAINT "Transfer_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE "TransferItem"
ADD CONSTRAINT "TransferItem_transferId_fkey"
FOREIGN KEY ("transferId") REFERENCES "Transfer"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TransferItem"
ADD CONSTRAINT "TransferItem_productId_fkey"
FOREIGN KEY ("productId") REFERENCES "Product"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;
