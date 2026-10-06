-- Report/dashboard filter index. CONCURRENTLY must be the only statement:
-- it cannot run inside the transaction a multi-statement file would get.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "StockMovement_companyId_shopId_createdAt_idx" ON "StockMovement"("companyId", "shopId", "createdAt");
