-- Rollback of 20261016120000_cheque_printer_profile (run by hand, then
-- delete the row from _prisma_migrations). Only the new columns go.
ALTER TABLE "ChequeSettings" DROP COLUMN IF EXISTS "printMode";
ALTER TABLE "ChequeSettings" DROP COLUMN IF EXISTS "feedMm";
ALTER TABLE "ChequeSettings" DROP COLUMN IF EXISTS "offsetMm";
ALTER TABLE "ChequeSettings" DROP COLUMN IF EXISTS "printableWidth";
