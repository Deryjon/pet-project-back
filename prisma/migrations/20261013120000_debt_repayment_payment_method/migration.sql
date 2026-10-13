-- How and where a client debt was repaid, so repayments show up in the sales
-- summary per payment method and shop.
ALTER TABLE "ClientDebtRepayment"
  ADD COLUMN "paymentMethod" TEXT,
  ADD COLUMN "paymentMethodName" TEXT,
  ADD COLUMN "branchCode" TEXT;

CREATE INDEX "ClientDebtRepayment_companyId_createdAt_idx" ON "ClientDebtRepayment"("companyId", "createdAt");
