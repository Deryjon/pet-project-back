-- Add explicit cancellation metadata and adjustment grouping for returns/exchanges.
-- All columns are nullable to keep existing sales compatible.

ALTER TABLE "Sale"
ADD COLUMN "adjustmentGroupId" TEXT,
ADD COLUMN "cancelledAt" TIMESTAMP(3),
ADD COLUMN "cancelledById" INTEGER,
ADD COLUMN "cancelReason" TEXT;

CREATE INDEX "Sale_adjustmentGroupId_idx" ON "Sale"("adjustmentGroupId");
CREATE INDEX "Sale_cancelledAt_idx" ON "Sale"("cancelledAt");
