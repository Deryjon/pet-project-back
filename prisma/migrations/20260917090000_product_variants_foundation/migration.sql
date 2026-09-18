-- P0.1: variant-ready catalog foundation. Legacy Product/ProductStock rows stay
-- in place while stock flows are migrated incrementally in the next phase.
CREATE TYPE "ProductSeason" AS ENUM ('SS', 'AW', 'NO_SEASON');
CREATE TYPE "ProductSizeType" AS ENUM ('CLOTHING', 'SHOES', 'OTHER');
CREATE TYPE "ProductSizeSystem" AS ENUM ('EU', 'US', 'UK', 'OTHER');

ALTER TABLE "Product"
  ADD COLUMN "article" TEXT,
  ADD COLUMN "gender" TEXT,
  ADD COLUMN "season" "ProductSeason" NOT NULL DEFAULT 'NO_SEASON',
  ADD COLUMN "seasonYear" INTEGER,
  ADD COLUMN "collection" TEXT;

CREATE TABLE "ProductColor" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductColor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductSize" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "type" "ProductSizeType" NOT NULL,
  "system" "ProductSizeSystem",
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariant" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "productId" INTEGER NOT NULL,
  "colorId" TEXT,
  "sizeId" TEXT,
  "barcode" TEXT,
  "sku" TEXT,
  "purchasePrice" DOUBLE PRECISION,
  "salePrice" DOUBLE PRECISION,
  "attributeValues" JSONB,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProductVariantStock" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "variantId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "branchCode" TEXT NOT NULL,
  "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "purchasePrice" DOUBLE PRECISION,
  "salePrice" DOUBLE PRECISION,
  "lowStockNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductVariantStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductColor_companyId_name_key" ON "ProductColor"("companyId", "name");
CREATE INDEX "ProductColor_companyId_isActive_idx" ON "ProductColor"("companyId", "isActive");
CREATE UNIQUE INDEX "ProductSize_companyId_type_name_key" ON "ProductSize"("companyId", "type", "name");
CREATE INDEX "ProductSize_companyId_type_isActive_sortOrder_idx" ON "ProductSize"("companyId", "type", "isActive", "sortOrder");
CREATE UNIQUE INDEX "ProductVariant_companyId_barcode_key" ON "ProductVariant"("companyId", "barcode");
CREATE UNIQUE INDEX "ProductVariant_companyId_sku_key" ON "ProductVariant"("companyId", "sku");
CREATE INDEX "ProductVariant_productId_isActive_idx" ON "ProductVariant"("productId", "isActive");
CREATE INDEX "ProductVariant_colorId_idx" ON "ProductVariant"("colorId");
CREATE INDEX "ProductVariant_sizeId_idx" ON "ProductVariant"("sizeId");
CREATE UNIQUE INDEX "ProductVariantStock_variantId_shopId_key" ON "ProductVariantStock"("variantId", "shopId");
CREATE UNIQUE INDEX "ProductVariantStock_variantId_branchCode_key" ON "ProductVariantStock"("variantId", "branchCode");
CREATE INDEX "ProductVariantStock_companyId_shopId_idx" ON "ProductVariantStock"("companyId", "shopId");
CREATE INDEX "Product_companyId_season_seasonYear_idx" ON "Product"("companyId", "season", "seasonYear");
CREATE INDEX "Product_companyId_collection_idx" ON "Product"("companyId", "collection");

ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_colorId_fkey" FOREIGN KEY ("colorId") REFERENCES "ProductColor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "ProductSize"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductVariantStock" ADD CONSTRAINT "ProductVariantStock_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Every legacy product becomes a product with one default variant. Keeping the
-- same SKU/barcode/prices makes this migration behaviorally neutral.
INSERT INTO "ProductVariant" (
  "id", "companyId", "productId", "barcode", "sku", "purchasePrice",
  "salePrice", "attributeValues", "isDefault", "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, p."companyId", p."id", p."barcode", p."sku",
  p."purchasePrice", p."salePrice", '{}'::jsonb, true,
  p."archivedAt" IS NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Product" p
WHERE p."companyId" IS NOT NULL;

-- Mirror legacy shop stock into the new variant stock table. Legacy rows are
-- intentionally retained until all write paths use variantId in P0.2.
INSERT INTO "ProductVariantStock" (
  "id", "companyId", "variantId", "shopId", "branchCode", "quantity",
  "purchasePrice", "salePrice", "lowStockNotifiedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text, v."companyId", v."id", s."shopId", s."branchCode",
  s."quantity", s."purchasePrice", s."salePrice", s."lowStockNotifiedAt",
  s."createdAt", s."updatedAt"
FROM "ProductStock" s
JOIN "ProductVariant" v ON v."productId" = s."productId" AND v."isDefault" = true;

-- Company-owned size catalogs. ON CONFLICT keeps the migration rerunnable in
-- development databases that were partially seeded.
INSERT INTO "ProductSize" ("id", "companyId", "name", "type", "system", "sortOrder", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, c."id", seed.name, seed.type::"ProductSizeType",
       seed.system::"ProductSizeSystem", seed.sort_order, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
CROSS JOIN (VALUES
  ('XXS','CLOTHING',NULL,10), ('XS','CLOTHING',NULL,20), ('S','CLOTHING',NULL,30),
  ('M','CLOTHING',NULL,40), ('L','CLOTHING',NULL,50), ('XL','CLOTHING',NULL,60),
  ('XXL','CLOTHING',NULL,70), ('XXXL','CLOTHING',NULL,80),
  ('44','CLOTHING',NULL,90), ('46','CLOTHING',NULL,100), ('48','CLOTHING',NULL,110),
  ('50','CLOTHING',NULL,120), ('52','CLOTHING',NULL,130), ('54','CLOTHING',NULL,140),
  ('110','CLOTHING',NULL,150), ('116','CLOTHING',NULL,160), ('122','CLOTHING',NULL,170),
  ('128','CLOTHING',NULL,180), ('134','CLOTHING',NULL,190),
  ('35','SHOES','EU',10), ('36','SHOES','EU',20), ('37','SHOES','EU',30),
  ('38','SHOES','EU',40), ('39','SHOES','EU',50), ('40','SHOES','EU',60),
  ('41','SHOES','EU',70), ('42','SHOES','EU',80), ('43','SHOES','EU',90),
  ('44','SHOES','EU',100), ('45','SHOES','EU',110), ('46','SHOES','EU',120)
) AS seed(name, type, system, sort_order)
ON CONFLICT ("companyId", "type", "name") DO NOTHING;
