-- Report/dashboard filter index. CONCURRENTLY must be the only statement:
-- it cannot run inside the transaction a multi-statement file would get.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ClientDebt_companyId_status_idx" ON "ClientDebt"("companyId", "status");
