-- Reverts 20261015120000_attribute_dictionaries. Only objects that migration
-- created are dropped; legacy colour/size/season data is untouched.
-- After running it: DELETE FROM "_prisma_migrations"
--   WHERE migration_name = '20261015120000_attribute_dictionaries';
BEGIN;
DROP TRIGGER IF EXISTS "ProductVariant_dictionary_links" ON "ProductVariant";
DROP TRIGGER IF EXISTS "Product_dictionary_links" ON "Product";
DROP FUNCTION IF EXISTS attr_dict_variant_links();
DROP FUNCTION IF EXISTS attr_dict_product_links();
ALTER TABLE "ProductColor" DROP CONSTRAINT IF EXISTS "ProductColor_attributeValueId_fkey";
ALTER TABLE "ProductSize" DROP CONSTRAINT IF EXISTS "ProductSize_attributeValueId_fkey";
ALTER TABLE "ProductSeasonOption" DROP CONSTRAINT IF EXISTS "ProductSeasonOption_attributeValueId_fkey";
DROP INDEX IF EXISTS "ProductColor_attributeValueId_idx";
DROP INDEX IF EXISTS "ProductSize_attributeValueId_idx";
DROP INDEX IF EXISTS "ProductSeasonOption_attributeValueId_idx";
ALTER TABLE "ProductColor" DROP COLUMN IF EXISTS "attributeValueId";
ALTER TABLE "ProductSize" DROP COLUMN IF EXISTS "attributeValueId";
ALTER TABLE "ProductSeasonOption" DROP COLUMN IF EXISTS "attributeValueId";
ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_colorValueId_fkey";
ALTER TABLE "ProductVariant" DROP CONSTRAINT IF EXISTS "ProductVariant_sizeValueId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_seasonValueId_fkey";
ALTER TABLE "Product" DROP CONSTRAINT IF EXISTS "Product_collectionValueId_fkey";
DROP INDEX IF EXISTS "ProductVariant_colorValueId_idx";
DROP INDEX IF EXISTS "ProductVariant_sizeValueId_idx";
DROP INDEX IF EXISTS "Product_seasonValueId_idx";
DROP INDEX IF EXISTS "Product_collectionValueId_idx";
ALTER TABLE "ProductVariant" DROP COLUMN IF EXISTS "colorValueId", DROP COLUMN IF EXISTS "sizeValueId";
ALTER TABLE "Product" DROP COLUMN IF EXISTS "seasonValueId", DROP COLUMN IF EXISTS "collectionValueId";
ALTER TABLE "Company" DROP COLUMN IF EXISTS "useAttributeDictionaries";
DROP TABLE IF EXISTS "AttributeBindingLog";
DROP TABLE IF EXISTS "StoreAttributeSetting";
DROP TABLE IF EXISTS "AttributeValue";
DROP TYPE IF EXISTS "AttributeValueType";
COMMIT;
