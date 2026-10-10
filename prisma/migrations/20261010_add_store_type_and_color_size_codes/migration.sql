-- Enums (idempotent)
DO $$ BEGIN
  CREATE TYPE "StoreType" AS ENUM ('ACCESSORIES', 'CLOTHING', 'SHOES', 'CLOTHING_SHOES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "ProductSizeKind" AS ENUM ('CLOTHING', 'SHOES');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Company.storeType
ALTER TABLE "Company" ADD COLUMN IF NOT EXISTS "storeType" "StoreType" NOT NULL DEFAULT 'ACCESSORIES';

-- ProductColor: code stays NULLABLE (old colors without code = NULL, unique index allows many NULLs)
ALTER TABLE "ProductColor" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "ProductColor" ADD COLUMN IF NOT EXISTS "hex" TEXT;
UPDATE "ProductColor" SET "code" = NULL WHERE trim("code") = '';

-- ProductSize: code NULLABLE, kind
ALTER TABLE "ProductSize" ADD COLUMN IF NOT EXISTS "code" TEXT;
ALTER TABLE "ProductSize" ADD COLUMN IF NOT EXISTS "kind" "ProductSizeKind";

-- Unique (companyId, code)
CREATE UNIQUE INDEX IF NOT EXISTS "ProductColor_companyId_code_key" ON "ProductColor"("companyId", "code");
CREATE UNIQUE INDEX IF NOT EXISTS "ProductSize_companyId_code_key"  ON "ProductSize"("companyId", "code");
