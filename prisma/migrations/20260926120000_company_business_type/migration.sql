ALTER TABLE "Company"
ADD COLUMN "businessType" TEXT NOT NULL DEFAULT 'clothing_store',
ADD COLUMN "productFeatureSettings" JSONB NOT NULL DEFAULT '{"variants":true,"color":true,"size":true,"season":true,"collection":true,"bundles":false}'::jsonb;

-- Existing tenants keep every product field which was available before this migration.
UPDATE "Company"
SET "businessType" = 'clothing_store',
    "productFeatureSettings" = '{"variants":true,"color":true,"size":true,"season":true,"collection":true,"bundles":false}'::jsonb;
