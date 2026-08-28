CREATE TYPE "SupplierInvoiceStatus" AS ENUM ('DRAFT', 'PROCESSING', 'REVIEW', 'READY', 'COMMITTED', 'CANCELLED', 'ROLLED_BACK');
CREATE TYPE "SupplierInvoiceItemStatus" AS ENUM ('MATCHED', 'NEEDS_REVIEW', 'NEW_PRODUCT', 'ERROR');
CREATE TYPE "SupplyPriceStrategy" AS ENUM ('LAST_PURCHASE', 'WEIGHTED_AVERAGE', 'MANUAL');

ALTER TABLE "Company" ADD COLUMN "supplyPriceStrategy" "SupplyPriceStrategy" NOT NULL DEFAULT 'LAST_PURCHASE';
ALTER TABLE "Supplier" ADD COLUMN "phone" TEXT, ADD COLUMN "telegram" TEXT, ADD COLUMN "comment" TEXT, ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "SupplierInvoice" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "supplierId" INTEGER NOT NULL,
  "invoiceNumber" TEXT, "invoiceDate" TIMESTAMP(3), "status" "SupplierInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
  "originalFiles" JSONB, "totalAmount" DECIMAL(14,2), "totalQuantity" DECIMAL(14,3), "idempotencyKey" TEXT,
  "createdById" INTEGER NOT NULL, "committedAt" TIMESTAMP(3), "rolledBackAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierInvoice_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierInvoiceItem" (
  "id" TEXT NOT NULL, "invoiceId" TEXT NOT NULL, "rawName" TEXT NOT NULL, "rawSku" TEXT, "rawBarcode" TEXT,
  "correctedName" TEXT, "correctedSku" TEXT, "correctedBarcode" TEXT,
  "originalQuantity" DECIMAL(14,3), "originalSupplyPrice" DECIMAL(14,2), "quantity" DECIMAL(14,3) NOT NULL,
  "supplyPrice" DECIMAL(14,2) NOT NULL, "totalPrice" DECIMAL(14,2), "matchedProductId" INTEGER,
  "matchMethod" TEXT, "matchConfidence" INTEGER, "status" "SupplierInvoiceItemStatus" NOT NULL DEFAULT 'NEEDS_REVIEW',
  "userConfirmed" BOOLEAN NOT NULL DEFAULT false, "warnings" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierInvoiceItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InvoiceAllocation" (
  "id" TEXT NOT NULL, "invoiceItemId" TEXT NOT NULL, "shopId" TEXT NOT NULL, "quantity" DECIMAL(14,3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "InvoiceAllocation_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SupplierProductAlias" (
  "id" TEXT NOT NULL, "companyId" TEXT NOT NULL, "supplierId" INTEGER NOT NULL, "productId" INTEGER NOT NULL,
  "supplierName" TEXT NOT NULL, "normalizedName" TEXT, "supplierSku" TEXT, "supplierBarcode" TEXT,
  "lastSupplyPrice" DECIMAL(14,2), "usageCount" INTEGER NOT NULL DEFAULT 0, "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProductAlias_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupplierInvoice_companyId_idempotencyKey_key" ON "SupplierInvoice"("companyId", "idempotencyKey");
CREATE INDEX "SupplierInvoice_companyId_status_createdAt_idx" ON "SupplierInvoice"("companyId", "status", "createdAt");
CREATE INDEX "SupplierInvoice_supplierId_invoiceNumber_invoiceDate_idx" ON "SupplierInvoice"("supplierId", "invoiceNumber", "invoiceDate");
CREATE INDEX "SupplierInvoiceItem_invoiceId_status_idx" ON "SupplierInvoiceItem"("invoiceId", "status");
CREATE INDEX "SupplierInvoiceItem_matchedProductId_idx" ON "SupplierInvoiceItem"("matchedProductId");
CREATE UNIQUE INDEX "InvoiceAllocation_invoiceItemId_shopId_key" ON "InvoiceAllocation"("invoiceItemId", "shopId");
CREATE INDEX "InvoiceAllocation_shopId_idx" ON "InvoiceAllocation"("shopId");
CREATE UNIQUE INDEX "SupplierProductAlias_companyId_supplierId_supplierSku_key" ON "SupplierProductAlias"("companyId", "supplierId", "supplierSku");
CREATE UNIQUE INDEX "SupplierProductAlias_companyId_supplierId_supplierBarcode_key" ON "SupplierProductAlias"("companyId", "supplierId", "supplierBarcode");
CREATE INDEX "SupplierProductAlias_companyId_supplierId_normalizedName_idx" ON "SupplierProductAlias"("companyId", "supplierId", "normalizedName");
CREATE INDEX "SupplierProductAlias_productId_idx" ON "SupplierProductAlias"("productId");

ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoice" ADD CONSTRAINT "SupplierInvoice_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "SupplierInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_matchedProductId_fkey" FOREIGN KEY ("matchedProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InvoiceAllocation" ADD CONSTRAINT "InvoiceAllocation_invoiceItemId_fkey" FOREIGN KEY ("invoiceItemId") REFERENCES "SupplierInvoiceItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceAllocation" ADD CONSTRAINT "InvoiceAllocation_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
