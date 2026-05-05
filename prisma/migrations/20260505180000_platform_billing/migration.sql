ALTER TABLE "Company"
ADD COLUMN "ownerName" TEXT,
ADD COLUMN "ownerPhone" TEXT,
ADD COLUMN "ownerEmail" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active',
ADD COLUMN "blockReason" TEXT;

ALTER TABLE "User"
ADD COLUMN "email" TEXT,
ADD COLUMN "passwordHash" TEXT,
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

CREATE TABLE "Plan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "priceMonthly" DECIMAL(12,2) NOT NULL,
  "maxShops" INTEGER NOT NULL,
  "maxUsers" INTEGER NOT NULL,
  "maxProducts" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Subscription" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "planId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'active',
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "subscriptionId" TEXT NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "method" TEXT NOT NULL,
  "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "comment" TEXT,
  "createdById" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformActionLog" (
  "id" TEXT NOT NULL,
  "adminId" INTEGER,
  "companyId" TEXT,
  "action" TEXT NOT NULL,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "PlatformActionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSetting" (
  "id" TEXT NOT NULL DEFAULT 'default',
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "PlatformSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Company_status_idx" ON "Company"("status");
CREATE INDEX "User_status_idx" ON "User"("status");
CREATE INDEX "Plan_status_idx" ON "Plan"("status");
CREATE INDEX "Subscription_companyId_status_idx" ON "Subscription"("companyId", "status");
CREATE INDEX "Subscription_status_endDate_idx" ON "Subscription"("status", "endDate");
CREATE INDEX "Payment_companyId_paidAt_idx" ON "Payment"("companyId", "paidAt");
CREATE INDEX "Payment_subscriptionId_idx" ON "Payment"("subscriptionId");
CREATE INDEX "PlatformActionLog_adminId_idx" ON "PlatformActionLog"("adminId");
CREATE INDEX "PlatformActionLog_companyId_idx" ON "PlatformActionLog"("companyId");
CREATE INDEX "PlatformActionLog_createdAt_idx" ON "PlatformActionLog"("createdAt");

ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformActionLog" ADD CONSTRAINT "PlatformActionLog_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PlatformActionLog" ADD CONSTRAINT "PlatformActionLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
