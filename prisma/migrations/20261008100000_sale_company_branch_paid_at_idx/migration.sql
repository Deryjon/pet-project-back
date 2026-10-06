-- Report/dashboard filter index. CONCURRENTLY must be the only statement:
-- it cannot run inside the transaction a multi-statement file would get.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Sale_companyId_branchCode_paidAt_idx" ON "Sale"("companyId", "branchCode", "paidAt");
