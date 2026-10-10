ALTER TABLE "ProductColor"
  ADD COLUMN IF NOT EXISTS "nameRu" TEXT,
  ADD COLUMN IF NOT EXISTS "nameUz" TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER NOT NULL DEFAULT 0;

UPDATE "ProductColor" SET "nameRu" = "name" WHERE "nameRu" IS NULL;
UPDATE "ProductColor" SET "code" = 'LEGACY' || upper(substr(replace("id", '-', ''), 1, 12)) WHERE "code" IS NULL OR trim("code") = '';
ALTER TABLE "ProductColor" ALTER COLUMN "code" SET DEFAULT '';
ALTER TABLE "ProductColor" ALTER COLUMN "code" SET NOT NULL;

ALTER TABLE "ProductSize"
  ADD COLUMN IF NOT EXISTS "nameRu" TEXT,
  ADD COLUMN IF NOT EXISTS "nameUz" TEXT;

UPDATE "ProductSize" SET "nameRu" = "name" WHERE "nameRu" IS NULL;
UPDATE "ProductSize" SET "code" = 'LEGACY' || upper(substr(replace("id", '-', ''), 1, 12)) WHERE "code" IS NULL OR trim("code") = '';
ALTER TABLE "ProductSize" ALTER COLUMN "code" SET DEFAULT '';
ALTER TABLE "ProductSize" ALTER COLUMN "code" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "ProductSeasonOption" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "nameRu" TEXT NOT NULL,
  "nameUz" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSeasonOption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProductSeasonOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProductSeasonOption_companyId_code_key" ON "ProductSeasonOption"("companyId", "code");
CREATE INDEX IF NOT EXISTS "ProductSeasonOption_companyId_isActive_sortOrder_idx" ON "ProductSeasonOption"("companyId", "isActive", "sortOrder");

ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "seasonOptionId" TEXT;
DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_seasonOptionId_fkey" FOREIGN KEY ("seasonOptionId") REFERENCES "ProductSeasonOption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "Product_companyId_article_key" ON "Product"("companyId", "article");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductVariant_productId_colorId_sizeId_key" ON "ProductVariant"("productId", "colorId", "sizeId");
