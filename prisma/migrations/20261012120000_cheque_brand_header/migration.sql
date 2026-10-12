-- Receipt header: brand name/tagline at the top and a configurable logo width.
ALTER TABLE "ChequeSettings"
  ADD COLUMN "logoWidth" INTEGER NOT NULL DEFAULT 60,
  ADD COLUMN "hasBrandName" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "brandName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "brandTagline" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "brandNameSize" INTEGER NOT NULL DEFAULT 24;
