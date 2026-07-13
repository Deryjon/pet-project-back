-- CreateTable
CREATE TABLE "Receipt" (
    "id" TEXT NOT NULL,
    "saleId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "shopId" TEXT,
    "branchCode" TEXT,
    "number" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "managerName" TEXT,
    "managerPhone" TEXT,
    "clientName" TEXT,
    "clientPhone" TEXT,
    "cashbackEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "qrPayload" TEXT,
    "printedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Receipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReceiptSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "showClientInfo" BOOLEAN NOT NULL DEFAULT true,
    "showManagerName" BOOLEAN NOT NULL DEFAULT true,
    "showManagerPhone" BOOLEAN NOT NULL DEFAULT false,
    "showCashback" BOOLEAN NOT NULL DEFAULT true,
    "showDebtLine" BOOLEAN NOT NULL DEFAULT true,
    "showQrCode" BOOLEAN NOT NULL DEFAULT false,
    "showItemIndex" BOOLEAN NOT NULL DEFAULT true,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "fontSize" INTEGER NOT NULL DEFAULT 13,
    "dividerStyle" TEXT NOT NULL DEFAULT 'single',
    "dividerGap" INTEGER NOT NULL DEFAULT 8,
    "sectionGap" INTEGER NOT NULL DEFAULT 12,
    "itemDividers" BOOLEAN NOT NULL DEFAULT false,
    "footerMessage" TEXT NOT NULL DEFAULT '',
    "footerNote" TEXT NOT NULL DEFAULT '',
    "hasLogo" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "hasBarCode" BOOLEAN NOT NULL DEFAULT false,
    "branchName" TEXT NOT NULL DEFAULT '',
    "hasBranchName" BOOLEAN NOT NULL DEFAULT false,
    "address" TEXT NOT NULL DEFAULT '',
    "hasAddress" BOOLEAN NOT NULL DEFAULT false,
    "phone" TEXT NOT NULL DEFAULT '',
    "hasPhone" BOOLEAN NOT NULL DEFAULT false,
    "workingHours" TEXT NOT NULL DEFAULT '',
    "hasWorkingHours" BOOLEAN NOT NULL DEFAULT false,
    "website" TEXT NOT NULL DEFAULT '',
    "hasWebsite" BOOLEAN NOT NULL DEFAULT false,
    "taxId" TEXT NOT NULL DEFAULT '',
    "hasTaxId" BOOLEAN NOT NULL DEFAULT false,
    "qrCodeUrl" TEXT NOT NULL DEFAULT '',
    "hasCustomerDebt" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomerBalance" BOOLEAN NOT NULL DEFAULT false,
    "elementStyles" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReceiptSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Receipt_saleId_key" ON "Receipt"("saleId");

-- CreateIndex
CREATE INDEX "Receipt_companyId_idx" ON "Receipt"("companyId");

-- CreateIndex
CREATE INDEX "Receipt_shopId_idx" ON "Receipt"("shopId");

-- CreateIndex
CREATE INDEX "Receipt_branchCode_idx" ON "Receipt"("branchCode");

-- CreateIndex
CREATE UNIQUE INDEX "ReceiptSettings_shopId_key" ON "ReceiptSettings"("shopId");

-- CreateIndex
CREATE INDEX "ReceiptSettings_companyId_idx" ON "ReceiptSettings"("companyId");

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Receipt" ADD CONSTRAINT "Receipt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptSettings" ADD CONSTRAINT "ReceiptSettings_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReceiptSettings" ADD CONSTRAINT "ReceiptSettings_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
