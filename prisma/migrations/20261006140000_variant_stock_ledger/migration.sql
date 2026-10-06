-- Stage 2: ProductVariantStock becomes the only stock ledger.
-- ProductStock.quantity and Product.quantity are maintained from it by
-- triggers, and direct writes of ProductStock.quantity are rejected.

-- 1-2. Alignment, as a function so it can be verified (and re-run) later.
-- Every product of a company gets a default variant. Then, per product and
-- shop, the default variant takes whatever ProductStock holds beyond the
-- other variants: all of it for simple goods, the "sold without a size"
-- residue for colour/size goods. When the other variants already exceed
-- ProductStock (the old catalog-form bug) ProductStock is raised to their
-- sum. No quantity is lost: each shop total stays or grows to the size sum.
CREATE FUNCTION stock_ledger_align() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_previous text := COALESCE(current_setting('konkurent.stock_ledger', true), '');
BEGIN
  PERFORM set_config('konkurent.stock_ledger', 'bypass', true);

  INSERT INTO "ProductVariant" (id, "companyId", "productId", barcode, sku,
    "purchasePrice", "salePrice", "attributeValues", "isDefault", "isActive",
    "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, p."companyId", p.id,
    CASE WHEN EXISTS (SELECT 1 FROM "ProductVariant" o
      WHERE o."companyId" = p."companyId" AND o.barcode = p.barcode)
      THEN NULL ELSE p.barcode END,
    CASE WHEN EXISTS (SELECT 1 FROM "ProductVariant" o
      WHERE o."companyId" = p."companyId" AND o.sku = p.sku)
      THEN NULL ELSE p.sku END,
    p."purchasePrice", p."salePrice", '{}'::jsonb, true,
    p."archivedAt" IS NULL, now(), now()
  FROM "Product" p
  WHERE p."companyId" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "ProductVariant" v WHERE v."productId" = p.id);

  WITH ledger_default AS (
    SELECT DISTINCT ON (v."productId") v."productId", v.id, v."companyId"
    FROM "ProductVariant" v WHERE v."isDefault"
    ORDER BY v."productId", v."createdAt", v.id
  ), ledger_other AS (
    SELECT v."productId", vs."shopId", sum(vs.quantity) AS quantity
    FROM "ProductVariantStock" vs
    JOIN "ProductVariant" v ON v.id = vs."variantId"
    WHERE NOT EXISTS (SELECT 1 FROM ledger_default d WHERE d.id = v.id)
    GROUP BY v."productId", vs."shopId"
  )
  INSERT INTO "ProductVariantStock" (id, "companyId", "variantId", "shopId",
    "branchCode", quantity, "purchasePrice", "salePrice", "lowStockNotifiedAt",
    "createdAt", "updatedAt")
  SELECT gen_random_uuid()::text, d."companyId", d.id, ps."shopId", ps."branchCode",
    GREATEST(ps.quantity - COALESCE(o.quantity, 0), 0),
    ps."purchasePrice", ps."salePrice", ps."lowStockNotifiedAt", now(), now()
  FROM "ProductStock" ps
  JOIN ledger_default d ON d."productId" = ps."productId"
  LEFT JOIN ledger_other o ON o."productId" = ps."productId" AND o."shopId" = ps."shopId"
  ON CONFLICT ("variantId", "shopId") DO UPDATE SET
    quantity = EXCLUDED.quantity, "updatedAt" = now()
  WHERE "ProductVariantStock".quantity IS DISTINCT FROM EXCLUDED.quantity;

  WITH ledger_default AS (
    SELECT DISTINCT ON (v."productId") v."productId", v.id
    FROM "ProductVariant" v WHERE v."isDefault"
    ORDER BY v."productId", v."createdAt", v.id
  )
  UPDATE "ProductVariantStock" vs SET quantity = 0, "updatedAt" = now()
  FROM ledger_default d
  WHERE vs."variantId" = d.id AND vs.quantity <> 0
    AND NOT EXISTS (SELECT 1 FROM "ProductStock" ps
      WHERE ps."productId" = d."productId" AND ps."shopId" = vs."shopId");

  INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity,
    "createdAt", "updatedAt")
  SELECT v."productId", vs."shopId", min(vs."branchCode"), sum(vs.quantity), now(), now()
  FROM "ProductVariantStock" vs
  JOIN "ProductVariant" v ON v.id = vs."variantId"
  GROUP BY v."productId", vs."shopId"
  ON CONFLICT ("productId", "shopId") DO UPDATE SET
    quantity = EXCLUDED.quantity, "updatedAt" = now()
  WHERE "ProductStock".quantity IS DISTINCT FROM EXCLUDED.quantity;

  UPDATE "Product" p SET quantity = s.quantity
  FROM (
    SELECT p2.id, COALESCE(sum(ps.quantity), 0) AS quantity
    FROM "Product" p2 LEFT JOIN "ProductStock" ps ON ps."productId" = p2.id
    GROUP BY p2.id
  ) s
  WHERE p.id = s.id AND p.quantity IS DISTINCT FROM s.quantity;

  PERFORM set_config('konkurent.stock_ledger', v_previous, true);
END $$;

SELECT stock_ledger_align();

-- 3. Ledger triggers. konkurent.stock_ledger is a transaction-local switch:
-- 'on' while the trigger itself writes ProductStock, 'bypass' for repair
-- scripts that rewrite both tables explicitly.
CREATE FUNCTION stock_ledger_mode() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('konkurent.stock_ledger', true), '')
$$;

CREATE FUNCTION stock_on_variant_stock_change() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_product integer;
  v_shop text;
  v_branch text;
  v_delta double precision;
  v_previous text := stock_ledger_mode();
BEGIN
  IF v_previous = 'bypass' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND (NEW."variantId" <> OLD."variantId" OR NEW."shopId" <> OLD."shopId") THEN
    RAISE EXCEPTION 'ProductVariantStock rows cannot move between variants or shops';
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_delta := -OLD.quantity;
    v_shop := OLD."shopId";
    v_branch := OLD."branchCode";
    SELECT "productId" INTO v_product FROM "ProductVariant" WHERE id = OLD."variantId";
  ELSE
    v_delta := NEW.quantity - CASE WHEN TG_OP = 'UPDATE' THEN OLD.quantity ELSE 0 END;
    v_shop := NEW."shopId";
    v_branch := NEW."branchCode";
    SELECT "productId" INTO v_product FROM "ProductVariant" WHERE id = NEW."variantId";
  END IF;
  IF v_delta = 0 OR v_product IS NULL THEN
    RETURN NULL;
  END IF;

  PERFORM set_config('konkurent.stock_ledger', 'on', true);
  IF TG_OP = 'DELETE' THEN
    UPDATE "ProductStock" SET quantity = quantity + v_delta, "updatedAt" = now()
    WHERE "productId" = v_product AND "shopId" = v_shop;
  ELSE
    INSERT INTO "ProductStock" ("productId", "shopId", "branchCode", quantity,
      "createdAt", "updatedAt")
    VALUES (v_product, v_shop, v_branch, v_delta, now(), now())
    ON CONFLICT ("productId", "shopId") DO UPDATE SET
      quantity = "ProductStock".quantity + EXCLUDED.quantity, "updatedAt" = now();
  END IF;
  UPDATE "Product" SET quantity = quantity + v_delta WHERE id = v_product;
  PERFORM set_config('konkurent.stock_ledger', v_previous, true);
  RETURN NULL;
END $$;

CREATE TRIGGER "ProductVariantStock_ledger"
AFTER INSERT OR UPDATE OF quantity, "variantId", "shopId" OR DELETE ON "ProductVariantStock"
FOR EACH ROW EXECUTE FUNCTION stock_on_variant_stock_change();

CREATE FUNCTION stock_guard_product_stock() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF stock_ledger_mode() IN ('on', 'bypass') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'INSERT' AND NEW.quantity <> 0)
     OR (TG_OP = 'UPDATE' AND NEW.quantity IS DISTINCT FROM OLD.quantity) THEN
    RAISE EXCEPTION 'ProductStock.quantity follows ProductVariantStock; change the variant stock instead'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER "ProductStock_quantity_guard"
BEFORE INSERT OR UPDATE ON "ProductStock"
FOR EACH ROW EXECUTE FUNCTION stock_guard_product_stock();
