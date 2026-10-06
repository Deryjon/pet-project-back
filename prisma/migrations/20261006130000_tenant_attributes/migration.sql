-- CreateEnum
CREATE TYPE "AttributeKind" AS ENUM ('SELECT', 'TEXT', 'NUMBER');

-- AlterTable
ALTER TABLE "ProductVariant" ADD COLUMN     "optionsKey" TEXT;

-- CreateTable
CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AttributeKind" NOT NULL DEFAULT 'SELECT',
    "isVariantAxis" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacySource" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttributeOption" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "meta" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "legacyColorId" TEXT,
    "legacySizeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeAxis" (
    "productId" INTEGER NOT NULL,
    "definitionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductAttributeAxis_pkey" PRIMARY KEY ("productId","definitionId")
);

-- CreateTable
CREATE TABLE "VariantAttributeValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "optionId" TEXT,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VariantAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAttributeValue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "productId" INTEGER NOT NULL,
    "definitionId" TEXT NOT NULL,
    "optionId" TEXT,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAttributeValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AttributeDefinition_companyId_isActive_sortOrder_idx" ON "AttributeDefinition"("companyId", "isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeDefinition_companyId_code_key" ON "AttributeDefinition"("companyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_legacyColorId_key" ON "AttributeOption"("legacyColorId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_legacySizeId_key" ON "AttributeOption"("legacySizeId");

-- CreateIndex
CREATE INDEX "AttributeOption_companyId_idx" ON "AttributeOption"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "AttributeOption_definitionId_value_key" ON "AttributeOption"("definitionId", "value");

-- CreateIndex
CREATE INDEX "ProductAttributeAxis_definitionId_idx" ON "ProductAttributeAxis"("definitionId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_definitionId_idx" ON "VariantAttributeValue"("definitionId");

-- CreateIndex
CREATE INDEX "VariantAttributeValue_optionId_idx" ON "VariantAttributeValue"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "VariantAttributeValue_variantId_definitionId_key" ON "VariantAttributeValue"("variantId", "definitionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_definitionId_idx" ON "ProductAttributeValue"("definitionId");

-- CreateIndex
CREATE INDEX "ProductAttributeValue_optionId_idx" ON "ProductAttributeValue"("optionId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductAttributeValue_productId_definitionId_key" ON "ProductAttributeValue"("productId", "definitionId");

-- CreateIndex
CREATE INDEX "ProductVariant_productId_optionsKey_idx" ON "ProductVariant"("productId", "optionsKey");

-- AddForeignKey
ALTER TABLE "AttributeDefinition" ADD CONSTRAINT "AttributeDefinition_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttributeOption" ADD CONSTRAINT "AttributeOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeAxis" ADD CONSTRAINT "ProductAttributeAxis_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeAxis" ADD CONSTRAINT "ProductAttributeAxis_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VariantAttributeValue" ADD CONSTRAINT "VariantAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAttributeValue" ADD CONSTRAINT "ProductAttributeValue_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "AttributeOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Legacy mirror: ProductColor / ProductSize and ProductVariant.colorId/sizeId
-- are mirrored into the tenant attribute tables by triggers, so every existing
-- write path keeps the new tables in sync without application changes. These
-- triggers are removed once colorId/sizeId are dropped.
-- ---------------------------------------------------------------------------

CREATE FUNCTION attr_size_code(p_type "ProductSizeType") RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_type WHEN 'CLOTHING' THEN 'size_clothing'
                     WHEN 'SHOES' THEN 'size_shoes'
                     ELSE 'size_other' END
$$;

CREATE FUNCTION attr_legacy_definition(p_company text, p_code text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_id text;
BEGIN
  INSERT INTO "AttributeDefinition" (id, "companyId", code, name, kind,
    "isVariantAxis", "sortOrder", "isActive", "legacySource", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, p_company, p_code,
    CASE p_code WHEN 'color' THEN 'Цвет' WHEN 'size_clothing' THEN 'Размер одежды'
                WHEN 'size_shoes' THEN 'Размер обуви' ELSE 'Размер' END,
    'SELECT', true,
    CASE p_code WHEN 'color' THEN 0 WHEN 'size_clothing' THEN 1
                WHEN 'size_shoes' THEN 2 ELSE 3 END,
    true, CASE WHEN p_code = 'color' THEN 'color' ELSE 'size' END, now(), now())
  ON CONFLICT ("companyId", code) DO NOTHING;
  SELECT id INTO v_id FROM "AttributeDefinition"
  WHERE "companyId" = p_company AND code = p_code;
  RETURN v_id;
END $$;

-- Recomputes the axis key of a variant and records the product axes it uses.
CREATE FUNCTION attr_refresh_variant(p_variant text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE "ProductVariant" v SET "optionsKey" = k.key
  FROM (
    SELECT string_agg(vav."definitionId" || ':' ||
             COALESCE(vav."optionId", 'text:' || COALESCE(vav."valueText", '')),
             '|' ORDER BY vav."definitionId") AS key
    FROM "VariantAttributeValue" vav
    JOIN "AttributeDefinition" d ON d.id = vav."definitionId" AND d."isVariantAxis"
    WHERE vav."variantId" = p_variant
  ) k
  WHERE v.id = p_variant AND v."optionsKey" IS DISTINCT FROM k.key;

  INSERT INTO "ProductAttributeAxis" ("productId", "definitionId", "sortOrder", "createdAt")
  SELECT v."productId", d.id, d."sortOrder", now()
  FROM "ProductVariant" v
  JOIN "VariantAttributeValue" vav ON vav."variantId" = v.id
  JOIN "AttributeDefinition" d ON d.id = vav."definitionId" AND d."isVariantAxis"
  WHERE v.id = p_variant
  ON CONFLICT DO NOTHING;
END $$;

CREATE FUNCTION attr_on_variant_value_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM attr_refresh_variant(OLD."variantId");
  ELSE
    PERFORM attr_refresh_variant(NEW."variantId");
    IF TG_OP = 'UPDATE' AND OLD."variantId" <> NEW."variantId" THEN
      PERFORM attr_refresh_variant(OLD."variantId");
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER "VariantAttributeValue_refresh_variant"
AFTER INSERT OR UPDATE OR DELETE ON "VariantAttributeValue"
FOR EACH ROW EXECUTE FUNCTION attr_on_variant_value_change();

CREATE FUNCTION attr_on_color_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_def text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "AttributeOption" WHERE "legacyColorId" = OLD.id;
    RETURN OLD;
  END IF;
  v_def := attr_legacy_definition(NEW."companyId", 'color');
  -- Adopt an option of the same name created through the attribute editor.
  UPDATE "AttributeOption" SET "legacyColorId" = NEW.id
  WHERE "definitionId" = v_def AND value = NEW.name AND "legacyColorId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "AttributeOption" WHERE "legacyColorId" = NEW.id);
  INSERT INTO "AttributeOption" (id, "companyId", "definitionId", value, "sortOrder",
    meta, "isActive", "legacyColorId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, NEW."companyId", v_def, NEW.name, 0,
    jsonb_build_object('code', NEW.code), NEW."isActive", NEW.id, now(), now())
  ON CONFLICT ("legacyColorId") DO UPDATE SET
    value = EXCLUDED.value, meta = EXCLUDED.meta,
    "isActive" = EXCLUDED."isActive", "updatedAt" = now();
  RETURN NEW;
END $$;

CREATE TRIGGER "ProductColor_mirror_attribute"
AFTER INSERT OR UPDATE ON "ProductColor"
FOR EACH ROW EXECUTE FUNCTION attr_on_color_change();

-- BEFORE DELETE: the option goes while variants still reference the row, so
-- refreshing their keys does not trip the ON DELETE SET NULL foreign key.
CREATE TRIGGER "ProductColor_unmirror_attribute"
BEFORE DELETE ON "ProductColor"
FOR EACH ROW EXECUTE FUNCTION attr_on_color_change();

CREATE FUNCTION attr_on_size_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE v_def text; v_option text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM "AttributeOption" WHERE "legacySizeId" = OLD.id;
    RETURN OLD;
  END IF;
  v_def := attr_legacy_definition(NEW."companyId", attr_size_code(NEW.type));
  UPDATE "AttributeOption" SET "legacySizeId" = NEW.id
  WHERE "definitionId" = v_def AND value = NEW.name AND "legacySizeId" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "AttributeOption" WHERE "legacySizeId" = NEW.id);
  INSERT INTO "AttributeOption" (id, "companyId", "definitionId", value, "sortOrder",
    meta, "isActive", "legacySizeId", "createdAt", "updatedAt")
  VALUES (gen_random_uuid()::text, NEW."companyId", v_def, NEW.name, NEW."sortOrder",
    jsonb_build_object('system', NEW.system), NEW."isActive", NEW.id, now(), now())
  ON CONFLICT ("legacySizeId") DO UPDATE SET
    "definitionId" = EXCLUDED."definitionId", value = EXCLUDED.value,
    "sortOrder" = EXCLUDED."sortOrder", meta = EXCLUDED.meta,
    "isActive" = EXCLUDED."isActive", "updatedAt" = now()
  RETURNING id INTO v_option;
  -- A size moved to another size type moves its variant values with it.
  UPDATE "VariantAttributeValue" SET "definitionId" = v_def, "updatedAt" = now()
  WHERE "optionId" = v_option AND "definitionId" <> v_def;
  RETURN NEW;
END $$;

CREATE TRIGGER "ProductSize_mirror_attribute"
AFTER INSERT OR UPDATE ON "ProductSize"
FOR EACH ROW EXECUTE FUNCTION attr_on_size_change();

-- BEFORE DELETE: the option goes while variants still reference the row, so
-- refreshing their keys does not trip the ON DELETE SET NULL foreign key.
CREATE TRIGGER "ProductSize_unmirror_attribute"
BEFORE DELETE ON "ProductSize"
FOR EACH ROW EXECUTE FUNCTION attr_on_size_change();

CREATE FUNCTION attr_on_variant_legacy_change() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM "VariantAttributeValue" vav USING "AttributeDefinition" d
  WHERE vav."variantId" = NEW.id AND d.id = vav."definitionId"
    AND d."legacySource" IS NOT NULL
    AND vav."optionId" IS DISTINCT FROM (
      SELECT o.id FROM "AttributeOption" o
      WHERE o."definitionId" = d.id
        AND (o."legacyColorId" = NEW."colorId" OR o."legacySizeId" = NEW."sizeId"));
  INSERT INTO "VariantAttributeValue" (id, "companyId", "variantId", "definitionId",
    "optionId", "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, NEW."companyId", NEW.id, o."definitionId", o.id, now(), now()
  FROM "AttributeOption" o
  WHERE o."legacyColorId" = NEW."colorId" OR o."legacySizeId" = NEW."sizeId"
  ON CONFLICT ("variantId", "definitionId") DO NOTHING;
  RETURN NULL;
END $$;

CREATE TRIGGER "ProductVariant_mirror_attributes"
AFTER INSERT OR UPDATE OF "colorId", "sizeId" ON "ProductVariant"
FOR EACH ROW EXECUTE FUNCTION attr_on_variant_legacy_change();

-- Backfill through the same trigger code. Safe to re-run.
CREATE FUNCTION attr_backfill_legacy() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM attr_legacy_definition(c.id, 'color') FROM "Company" c
  WHERE c."productFeatureSettings"->>'color' = 'true';
  PERFORM attr_legacy_definition(c.id, code) FROM "Company" c,
    unnest(ARRAY['size_clothing', 'size_shoes']) code
  WHERE c."productFeatureSettings"->>'size' = 'true';
  UPDATE "ProductColor" SET name = name;
  UPDATE "ProductSize" SET name = name;
  UPDATE "ProductVariant" SET "colorId" = "colorId"
  WHERE "colorId" IS NOT NULL OR "sizeId" IS NOT NULL;
END $$;

SELECT attr_backfill_legacy();
