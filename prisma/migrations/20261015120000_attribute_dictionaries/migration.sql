-- Shared colour/size/season dictionaries for apparel stores (TZ 15.10.2026).
-- Additive only: new tables, nullable columns and a flag that is off for every
-- existing company. No existing column, value or index is changed.
-- Rollback: down.sql in this folder.

-- CreateEnum
CREATE TYPE "AttributeValueType" AS ENUM ('COLOR', 'SIZE', 'SEASON');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "useAttributeDictionaries" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "collectionValueId" TEXT,
ADD COLUMN     "seasonValueId" TEXT;

-- AlterTable
ALTER TABLE "ProductColor" ADD COLUMN     "attributeValueId" TEXT;

-- AlterTable
ALTER TABLE "ProductSeasonOption" ADD COLUMN     "attributeValueId" TEXT;

-- AlterTable
ALTER TABLE "ProductSize" ADD COLUMN     "attributeValueId" TEXT;

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "colorValueId" TEXT,
ADD COLUMN     "sizeValueId" TEXT;

-- CreateTable
CREATE TABLE "AttributeValue" (
    "id" TEXT NOT NULL,
    "type" "AttributeValueType" NOT NULL,
    "companyId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "group" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StoreAttributeSetting" (
    "companyId" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StoreAttributeSetting_pkey" PRIMARY KEY ("companyId","attributeId")
);

-- CreateTable
CREATE TABLE "AttributeBindingLog" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "sourceText" TEXT,
    "oldValueId" TEXT,
    "newValueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AttributeBindingLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributeValue_type_companyId_isActive_sortOrder_idx" ON "AttributeValue"("type", "companyId", "isActive", "sortOrder");

-- CreateIndex
CREATE INDEX "StoreAttributeSetting_attributeId_idx" ON "StoreAttributeSetting"("attributeId");

-- CreateIndex
CREATE INDEX "AttributeBindingLog_companyId_batchId_idx" ON "AttributeBindingLog"("companyId", "batchId");

-- CreateIndex
CREATE INDEX "AttributeBindingLog_entity_entityId_idx" ON "AttributeBindingLog"("entity", "entityId");

-- CreateIndex
CREATE INDEX "Product_seasonValueId_idx" ON "Product"("seasonValueId");

-- CreateIndex
CREATE INDEX "Product_collectionValueId_idx" ON "Product"("collectionValueId");

-- CreateIndex
CREATE INDEX "ProductColor_attributeValueId_idx" ON "ProductColor"("attributeValueId");

-- CreateIndex
CREATE INDEX "ProductSeasonOption_attributeValueId_idx" ON "ProductSeasonOption"("attributeValueId");

-- CreateIndex
CREATE INDEX "ProductSize_attributeValueId_idx" ON "ProductSize"("attributeValueId");

-- CreateIndex
CREATE INDEX "ProductVariant_colorValueId_idx" ON "ProductVariant"("colorValueId");

-- CreateIndex
CREATE INDEX "ProductVariant_sizeValueId_idx" ON "ProductVariant"("sizeValueId");

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_seasonValueId_fkey" FOREIGN KEY ("seasonValueId") REFERENCES "AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_collectionValueId_fkey" FOREIGN KEY ("collectionValueId") REFERENCES "AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductColor" ADD CONSTRAINT "ProductColor_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "AttributeValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "AttributeValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSeasonOption" ADD CONSTRAINT "ProductSeasonOption_attributeValueId_fkey" FOREIGN KEY ("attributeValueId") REFERENCES "AttributeValue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_colorValueId_fkey" FOREIGN KEY ("colorValueId") REFERENCES "AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductVariant" ADD CONSTRAINT "ProductVariant_sizeValueId_fkey" FOREIGN KEY ("sizeValueId") REFERENCES "AttributeValue"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAttributeSetting" ADD CONSTRAINT "StoreAttributeSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoreAttributeSetting" ADD CONSTRAINT "StoreAttributeSetting_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "AttributeValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeBindingLog" ADD CONSTRAINT "AttributeBindingLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Unique (type, companyId, group, code) with NULL companyId/group compared as
-- equal, so a system value exists once. Prisma cannot declare expression
-- indexes; ON CONFLICT in the seed names the same expressions.
CREATE UNIQUE INDEX "AttributeValue_type_scope_group_code_key"
  ON "AttributeValue" ("type", COALESCE("companyId", ''), COALESCE("group", ''), "code");

-- System values carry no company; store values always do.
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_default_scope_check"
  CHECK (("isDefault" AND "companyId" IS NULL) OR (NOT "isDefault" AND "companyId" IS NOT NULL));

-- Goods follow the dictionary link of their legacy colour/size/season row.
-- Only a changed legacy reference recomputes the link, so attributes:apply
-- and attributes:rollback write the value columns directly. Rows whose legacy
-- row is not linked get NULL — the state of every company before apply.
CREATE FUNCTION attr_dict_variant_links() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW."colorId" IS DISTINCT FROM OLD."colorId" THEN
    IF NEW."colorId" IS NOT NULL THEN
      NEW."colorValueId" := (SELECT "attributeValueId" FROM "ProductColor" WHERE id = NEW."colorId");
    ELSIF TG_OP = 'UPDATE' THEN
      NEW."colorValueId" := NULL;
    END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW."sizeId" IS DISTINCT FROM OLD."sizeId" THEN
    IF NEW."sizeId" IS NOT NULL THEN
      NEW."sizeValueId" := (SELECT "attributeValueId" FROM "ProductSize" WHERE id = NEW."sizeId");
    ELSIF TG_OP = 'UPDATE' THEN
      NEW."sizeValueId" := NULL;
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ProductVariant_dictionary_links"
BEFORE INSERT OR UPDATE OF "colorId", "sizeId" ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION attr_dict_variant_links();

-- Season from the legacy season row; collection by its code, and only for
-- companies that turned the dictionaries on.
CREATE FUNCTION attr_dict_product_links() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_code text;
BEGIN
  IF TG_OP = 'INSERT' OR NEW."seasonOptionId" IS DISTINCT FROM OLD."seasonOptionId" THEN
    IF NEW."seasonOptionId" IS NOT NULL THEN
      NEW."seasonValueId" := (SELECT "attributeValueId" FROM "ProductSeasonOption" WHERE id = NEW."seasonOptionId");
    ELSIF TG_OP = 'UPDATE' THEN
      NEW."seasonValueId" := NULL;
    END IF;
  END IF;
  IF (TG_OP = 'INSERT' OR NEW.collection IS DISTINCT FROM OLD.collection)
     AND EXISTS (SELECT 1 FROM "Company" WHERE id = NEW."companyId" AND "useAttributeDictionaries") THEN
    v_code := regexp_replace(upper(regexp_replace(coalesce(NEW.collection, ''), '[[:space:]-]+', '', 'g')),
                             '^(SS|FW)20([0-9]{2})$', '\1\2');
    NEW."collectionValueId" := (
      SELECT id FROM "AttributeValue"
      WHERE type = 'SEASON' AND "group" = 'COLLECTION' AND code = v_code AND "archivedAt" IS NULL
        AND ("companyId" IS NULL OR "companyId" = NEW."companyId")
      ORDER BY "isDefault" DESC LIMIT 1);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "Product_dictionary_links"
BEFORE INSERT OR UPDATE OF "seasonOptionId", collection ON "Product"
FOR EACH ROW EXECUTE FUNCTION attr_dict_product_links();
