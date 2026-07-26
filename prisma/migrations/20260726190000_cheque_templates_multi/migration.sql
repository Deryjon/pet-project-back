-- Allow a company to have multiple named cheque templates (mirrors Billz's
-- /api/v1/cheque list + /api/v1/cheque/:id, e.g. "Стандартный", "Акция"...),
-- with exactly one marked isDefault at a time — that's the one used to
-- render/print receipts.

ALTER TABLE "ChequeSettings" DROP CONSTRAINT IF EXISTS "ChequeSettings_companyId_key";
DROP INDEX IF EXISTS "ChequeSettings_companyId_key";

ALTER TABLE "ChequeSettings"
  ADD COLUMN "name" TEXT NOT NULL DEFAULT 'Стандартный',
  ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Any company that already had a (singleton) row keeps working as its default.
UPDATE "ChequeSettings" SET "isDefault" = true;

CREATE INDEX "ChequeSettings_companyId_idx" ON "ChequeSettings"("companyId");
