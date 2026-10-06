-- Read-only check before adding CHECK (quantity >= 0) constraints (audit 🔴7).
-- Run against production (read replica if possible); it changes nothing.
-- Every row returned must be fixed before the constraint can be validated.

-- Variant stock per shop (the stock ledger).
SELECT 'ProductVariantStock' AS source, pvs.id, pv."productId", pvs."variantId",
       pvs."shopId", pvs.quantity
FROM "ProductVariantStock" pvs
JOIN "ProductVariant" pv ON pv.id = pvs."variantId"
WHERE pvs.quantity < 0
UNION ALL
-- Product stock per shop (derived from the ledger by trigger).
SELECT 'ProductStock', ps.id::text, ps."productId", NULL, ps."shopId", ps.quantity
FROM "ProductStock" ps
WHERE ps.quantity < 0
UNION ALL
-- Product totals (derived by trigger).
SELECT 'Product', p.id::text, p.id, NULL, NULL, p.quantity
FROM "Product" p
WHERE p.quantity < 0
ORDER BY source, quantity;

-- Summary per company.
SELECT p."companyId", count(*) AS negative_variant_stocks, sum(pvs.quantity) AS total_negative
FROM "ProductVariantStock" pvs
JOIN "ProductVariant" pv ON pv.id = pvs."variantId"
JOIN "Product" p ON p.id = pv."productId"
WHERE pvs.quantity < 0
GROUP BY p."companyId"
ORDER BY negative_variant_stocks DESC;
