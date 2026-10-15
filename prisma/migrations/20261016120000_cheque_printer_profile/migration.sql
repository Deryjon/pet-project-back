-- Receipt templates become printer profiles: print width, left offset,
-- paper feed and print method per template. Additive only; existing
-- templates keep printing as before (0 / 'browser' = previous behaviour).
ALTER TABLE "ChequeSettings" ADD COLUMN IF NOT EXISTS "printableWidth" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChequeSettings" ADD COLUMN IF NOT EXISTS "offsetMm" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChequeSettings" ADD COLUMN IF NOT EXISTS "feedMm" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChequeSettings" ADD COLUMN IF NOT EXISTS "printMode" TEXT NOT NULL DEFAULT 'browser';
