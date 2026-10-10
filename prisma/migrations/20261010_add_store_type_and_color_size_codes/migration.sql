-- Add StoreType enum
CREATE TYPE "StoreType" AS ENUM ('ACCESSORIES', 'CLOTHING', 'SHOES', 'CLOTHING_SHOES');

-- Add ProductSizeKind enum
CREATE TYPE "ProductSizeKind" AS ENUM ('CLOTHING', 'SHOES');

-- Add storeType to Company
ALTER TABLE "Company" ADD COLUMN "storeType" "StoreType" NOT NULL DEFAULT 'ACCESSORIES';

-- Update ProductColor: add code and hex columns, add unique constraint on code
ALTER TABLE "ProductColor" DROP CONSTRAINT IF EXISTS "ProductColor_companyId_code_key";
ALTER TABLE "ProductColor" ADD COLUMN "hex" TEXT;
UPDATE "ProductColor" SET "code" = COALESCE("code", '') WHERE "code" IS NULL;
ALTER TABLE "ProductColor" ALTER COLUMN "code" SET NOT NULL;
ALTER TABLE "ProductColor" ALTER COLUMN "code" SET DEFAULT '';
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_companyId_code_key" UNIQUE ("companyId", "code");

-- Update ProductSize: add code and kind columns, add unique constraint on code
ALTER TABLE "ProductSize" ADD COLUMN "code" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProductSize" ADD COLUMN "kind" "ProductSizeKind";
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_companyId_code_key" UNIQUE ("companyId", "code");

-- Create indexes for better query performance
CREATE INDEX "ProductColor_companyId_code_idx" ON "ProductColor"("companyId", "code");
CREATE INDEX "ProductSize_companyId_code_idx" ON "ProductSize"("companyId", "code");
