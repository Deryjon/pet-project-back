-- CreateTable
CREATE TABLE "ImportSession" (
    "id" TEXT NOT NULL,
    "jobId" TEXT,
    "companyId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "branchCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "fields" JSONB NOT NULL,
    "rows" JSONB NOT NULL,
    "items" JSONB NOT NULL,
    "onMatchPolicy" JSONB NOT NULL,
    "dryRunSummary" JSONB,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "current" INTEGER NOT NULL,
    "percent" INTEGER NOT NULL,
    "isFinished" BOOLEAN NOT NULL,
    "importId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ImportSession_companyId_createdAt_idx" ON "ImportSession"("companyId", "createdAt");

-- CreateIndex
CREATE INDEX "ImportSession_status_idx" ON "ImportSession"("status");

-- CreateIndex
CREATE INDEX "ImportJob_importId_idx" ON "ImportJob"("importId");

-- CreateIndex
CREATE INDEX "ImportJob_companyId_createdAt_idx" ON "ImportJob"("companyId", "createdAt");

-- AddForeignKey
ALTER TABLE "ImportSession" ADD CONSTRAINT "ImportSession_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
