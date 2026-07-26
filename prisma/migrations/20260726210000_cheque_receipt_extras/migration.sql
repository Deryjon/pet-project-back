-- Closer parity with the Billz cheque reference: a sale-level comment
-- ("Sotuv sharhi"), a separate seller line ("Sotuvchi", distinct from the
-- cashier who processed payment), discount-percent display (item + receipt
-- level), and an additional-image block alongside the logo.

ALTER TABLE "Sale" ADD COLUMN "comment" TEXT;

ALTER TABLE "Receipt"
  ADD COLUMN "sellerName" TEXT,
  ADD COLUMN "saleComment" TEXT,
  ADD COLUMN "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ChequeSettings"
  ADD COLUMN "hasAdditionalImage" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "additionalImageUrl" TEXT NOT NULL DEFAULT '';
