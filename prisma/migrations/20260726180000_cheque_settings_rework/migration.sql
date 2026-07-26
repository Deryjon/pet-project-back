-- Rework cheque/receipt settings from per-shop boolean flags into a single
-- company-wide, ordered, toggleable block list (mirrors how Billz models a
-- cheque). See src/receipts/cheque-blocks.constant.ts for the block catalog.

-- Freeze customer balance/debt breakdown on the Receipt snapshot, same as
-- the existing money fields, so a reprint never disagrees with what the
-- customer was told at sale time.
ALTER TABLE "Receipt"
  ADD COLUMN "balanceBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "balanceAdded" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "balanceDeducted" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "debtBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "debtAdded" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "debtPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "debtAfter" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Drop the per-shop settings table this replaces.
ALTER TABLE "ReceiptSettings" DROP CONSTRAINT IF EXISTS "ReceiptSettings_companyId_fkey";
ALTER TABLE "ReceiptSettings" DROP CONSTRAINT IF EXISTS "ReceiptSettings_shopId_fkey";
DROP TABLE "ReceiptSettings";

-- Drop the already-dead legacy table (its one-time data migration into
-- ReceiptSettings already ran; see prisma/migrate-receipt-settings.ts).
ALTER TABLE "ChequeSetting" DROP CONSTRAINT IF EXISTS "ChequeSetting_companyId_fkey";
DROP TABLE "ChequeSetting";

CREATE TABLE "ChequeSettings" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "hasInformationBlock" BOOLEAN NOT NULL DEFAULT true,
    "hasLowerBlock" BOOLEAN NOT NULL DEFAULT true,
    "paperWidth" INTEGER NOT NULL DEFAULT 80,
    "fontSize" INTEGER NOT NULL DEFAULT 13,
    "dividerStyle" TEXT NOT NULL DEFAULT 'single',
    "dividerGap" INTEGER NOT NULL DEFAULT 8,
    "sectionGap" INTEGER NOT NULL DEFAULT 12,
    "itemDividers" BOOLEAN NOT NULL DEFAULT false,
    "hasLogo" BOOLEAN NOT NULL DEFAULT false,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "footerMessage" TEXT NOT NULL DEFAULT '',
    "footerNote" TEXT NOT NULL DEFAULT '',
    "qrCodeUrl" TEXT NOT NULL DEFAULT '',
    "elementStyles" JSONB,
    "blocks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChequeSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChequeSettings_companyId_key" ON "ChequeSettings"("companyId");

ALTER TABLE "ChequeSettings"
  ADD CONSTRAINT "ChequeSettings_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
