-- Create client enums if they do not exist yet
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientGender') THEN
    CREATE TYPE "ClientGender" AS ENUM ('male', 'female', 'unknown');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientDebtStatus') THEN
    CREATE TYPE "ClientDebtStatus" AS ENUM ('paid', 'partial', 'unpaid');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ClientCardType') THEN
    CREATE TYPE "ClientCardType" AS ENUM ('local', 'loyalty', 'discount', 'bonus');
  END IF;
END $$;

-- CreateTable
CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT,
  "middleName" TEXT,
  "phone" TEXT NOT NULL,
  "gender" "ClientGender" NOT NULL DEFAULT 'unknown',
  "birthDate" DATE,
  "maritalStatus" TEXT,
  "address" TEXT,
  "socialLinks" JSONB,
  "relatives" JSONB,
  "registrationShopId" TEXT,
  "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "balanceUzs" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "debtUzs" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalPurchasesUzs" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "lastPurchaseAt" TIMESTAMP(3),
  "visitsCount" INTEGER NOT NULL DEFAULT 0,
  "smsNotifications" BOOLEAN NOT NULL DEFAULT false,
  "phoneNotifications" BOOLEAN NOT NULL DEFAULT false,
  "socialNotifications" BOOLEAN NOT NULL DEFAULT false,
  "emailNotifications" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientGroup" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientGroupLink" (
  "clientId" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientGroupLink_pkey" PRIMARY KEY ("clientId","groupId")
);

-- CreateTable
CREATE TABLE "ClientTag" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTagLink" (
  "clientId" TEXT NOT NULL,
  "tagId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientTagLink_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateTable
CREATE TABLE "ClientNote" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "createdById" INTEGER,
  "text" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDebt" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "shopId" TEXT,
  "amountUzs" DECIMAL(12,2) NOT NULL,
  "remainingAmountUzs" DECIMAL(12,2) NOT NULL,
  "repaidAmountUzs" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "dueDate" DATE,
  "status" "ClientDebtStatus" NOT NULL DEFAULT 'unpaid',
  "receiptUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientDebt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDebtRepayment" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "debtId" TEXT NOT NULL,
  "createdById" INTEGER,
  "amountUzs" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ClientDebtRepayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCard" (
  "id" TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "type" "ClientCardType" NOT NULL DEFAULT 'local',
  "number" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "issuedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ClientCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_code_key" ON "Client"("companyId", "code");
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");
CREATE INDEX "Client_companyId_phone_idx" ON "Client"("companyId", "phone");
CREATE INDEX "Client_registrationShopId_idx" ON "Client"("registrationShopId");
CREATE INDEX "Client_registeredAt_idx" ON "Client"("registeredAt");

CREATE UNIQUE INDEX "ClientGroup_companyId_name_key" ON "ClientGroup"("companyId", "name");
CREATE INDEX "ClientGroup_companyId_idx" ON "ClientGroup"("companyId");
CREATE INDEX "ClientGroupLink_groupId_idx" ON "ClientGroupLink"("groupId");

CREATE UNIQUE INDEX "ClientTag_companyId_name_key" ON "ClientTag"("companyId", "name");
CREATE INDEX "ClientTag_companyId_idx" ON "ClientTag"("companyId");
CREATE INDEX "ClientTagLink_tagId_idx" ON "ClientTagLink"("tagId");

CREATE INDEX "ClientNote_companyId_clientId_idx" ON "ClientNote"("companyId", "clientId");
CREATE INDEX "ClientNote_createdById_idx" ON "ClientNote"("createdById");

CREATE INDEX "ClientDebt_companyId_clientId_idx" ON "ClientDebt"("companyId", "clientId");
CREATE INDEX "ClientDebt_shopId_idx" ON "ClientDebt"("shopId");
CREATE INDEX "ClientDebt_status_idx" ON "ClientDebt"("status");

CREATE INDEX "ClientDebtRepayment_companyId_clientId_idx" ON "ClientDebtRepayment"("companyId", "clientId");
CREATE INDEX "ClientDebtRepayment_debtId_idx" ON "ClientDebtRepayment"("debtId");
CREATE INDEX "ClientDebtRepayment_createdById_idx" ON "ClientDebtRepayment"("createdById");

CREATE UNIQUE INDEX "ClientCard_companyId_number_key" ON "ClientCard"("companyId", "number");
CREATE INDEX "ClientCard_companyId_clientId_idx" ON "ClientCard"("companyId", "clientId");

CREATE INDEX "Order_customerId_idx" ON "Order"("customerId");

-- AddForeignKey
ALTER TABLE "Client"
ADD CONSTRAINT "Client_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Client"
ADD CONSTRAINT "Client_registrationShopId_fkey"
FOREIGN KEY ("registrationShopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientGroup"
ADD CONSTRAINT "ClientGroup_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientGroupLink"
ADD CONSTRAINT "ClientGroupLink_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientGroupLink"
ADD CONSTRAINT "ClientGroupLink_groupId_fkey"
FOREIGN KEY ("groupId") REFERENCES "ClientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientTag"
ADD CONSTRAINT "ClientTag_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientTagLink"
ADD CONSTRAINT "ClientTagLink_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientTagLink"
ADD CONSTRAINT "ClientTagLink_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "ClientTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientNote"
ADD CONSTRAINT "ClientNote_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientNote"
ADD CONSTRAINT "ClientNote_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientNote"
ADD CONSTRAINT "ClientNote_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientDebt"
ADD CONSTRAINT "ClientDebt_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDebt"
ADD CONSTRAINT "ClientDebt_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDebt"
ADD CONSTRAINT "ClientDebt_shopId_fkey"
FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientDebtRepayment"
ADD CONSTRAINT "ClientDebtRepayment_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDebtRepayment"
ADD CONSTRAINT "ClientDebtRepayment_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDebtRepayment"
ADD CONSTRAINT "ClientDebtRepayment_debtId_fkey"
FOREIGN KEY ("debtId") REFERENCES "ClientDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientDebtRepayment"
ADD CONSTRAINT "ClientDebtRepayment_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ClientCard"
ADD CONSTRAINT "ClientCard_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ClientCard"
ADD CONSTRAINT "ClientCard_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Order"
ADD CONSTRAINT "Order_customerId_fkey"
FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
