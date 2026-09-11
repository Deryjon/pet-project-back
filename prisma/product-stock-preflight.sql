-- Read-only checks before product_stock_shop_identity.
-- Run against an isolated copy of the database before deciding how to repair rows.
BEGIN TRANSACTION READ ONLY;

-- Blocker: several stock rows would map to the same product/shop.
SELECT ps."productId", ps."branchCode", count(*) AS row_count,
       array_agg(ps.id ORDER BY ps.id) AS stock_ids, sum(ps.quantity) AS total_quantity
FROM "ProductStock" ps
GROUP BY ps."productId", ps."branchCode"
HAVING count(*) > 1
ORDER BY ps."productId", ps."branchCode";

-- Blocker: no shop with this branch code inside the product's company.
SELECT ps.id AS stock_id, ps."productId", p."companyId", ps."branchCode", ps.quantity
FROM "ProductStock" ps
JOIN "Product" p ON p.id = ps."productId"
LEFT JOIN "Shop" s ON s."companyId" = p."companyId" AND s."branchCode" = ps."branchCode"
WHERE s.id IS NULL
ORDER BY ps.id;

-- Reconciliation: report discrepancies, do not automatically merge or overwrite.
SELECT p.id AS product_id, p."companyId", p.quantity AS product_quantity,
       coalesce(sum(ps.quantity), 0) AS stock_quantity
FROM "Product" p
LEFT JOIN "ProductStock" ps ON ps."productId" = p.id
GROUP BY p.id, p."companyId", p.quantity
HAVING abs(p.quantity - coalesce(sum(ps.quantity), 0)) > 0.000001
ORDER BY p.id;

COMMIT;
