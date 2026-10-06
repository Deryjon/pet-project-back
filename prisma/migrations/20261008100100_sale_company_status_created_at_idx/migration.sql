-- Report/dashboard filter index. CONCURRENTLY must be the only statement:
-- it cannot run inside the transaction a multi-statement file would get.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_companyId_status_createdAt_idx" ON "Sale"("companyId", "status", "createdAt");
