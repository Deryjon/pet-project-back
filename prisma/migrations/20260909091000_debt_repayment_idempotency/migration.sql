ALTER TABLE "ClientDebtRepayment" ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ClientDebtRepayment_companyId_debtId_idempotencyKey_key"
  ON "ClientDebtRepayment"("companyId", "debtId", "idempotencyKey");
