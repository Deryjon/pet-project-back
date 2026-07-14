-- AlterTable: freeze items/money on Receipt at first-print time so a reprint
-- months later renders identically even if product prices or payment-type
-- config changed since (see receipts.service.ts snapshot creation).
ALTER TABLE "Receipt"
  ADD COLUMN "items" JSONB,
  ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "discount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "totalDue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "paidCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "paidCard" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "paidCashback" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "debt" DOUBLE PRECISION NOT NULL DEFAULT 0;
