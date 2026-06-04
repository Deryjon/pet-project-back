CREATE TABLE "ProductImportSession" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "shopId" TEXT NOT NULL,
  "branchCode" TEXT NOT NULL,
  "branchName" TEXT,
  "stocktakingId" TEXT,
  "name" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "fields" JSONB NOT NULL,
  "rows" JSONB NOT NULL,
  "items" JSONB NOT NULL,
  "onMatchPolicy" JSONB NOT NULL,
  "dryRunSummary" JSONB,
  "result" JSONB,
  "createdAt" TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "ProductImportSession_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProductImportSession_companyId_status_idx"
  ON "ProductImportSession"("companyId", "status");

CREATE INDEX "ProductImportSession_shopId_idx"
  ON "ProductImportSession"("shopId");

CREATE INDEX "ProductImportSession_jobId_idx"
  ON "ProductImportSession"("jobId");
