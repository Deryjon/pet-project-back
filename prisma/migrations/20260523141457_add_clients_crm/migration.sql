-- CreateEnum
CREATE TYPE "ClientGender" AS ENUM ('male', 'female', 'unknown');

-- CreateEnum
CREATE TYPE "ClientDebtStatus" AS ENUM ('paid', 'partial', 'unpaid');

-- CreateEnum
CREATE TYPE "ClientCardType" AS ENUM ('local', 'loyalty', 'discount', 'bonus');

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
CREATE INDEX "Client_companyId_idx" ON "Client"("companyId");

-- CreateIndex
CREATE INDEX "Client_companyId_phone_idx" ON "Client"("companyId", "phone");

-- CreateIndex
CREATE INDEX "Client_registrationShopId_idx" ON "Client"("registrationShopId");

-- CreateIndex
CREATE INDEX "Client_registeredAt_idx" ON "Client"("registeredAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_companyId_code_key" ON "Client"("companyId", "code");

-- CreateIndex
CREATE INDEX "ClientGroup_companyId_idx" ON "ClientGroup"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientGroup_companyId_name_key" ON "ClientGroup"("companyId", "name");

-- CreateIndex
CREATE INDEX "ClientGroupLink_groupId_idx" ON "ClientGroupLink"("groupId");

-- CreateIndex
CREATE INDEX "ClientTag_companyId_idx" ON "ClientTag"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTag_companyId_name_key" ON "ClientTag"("companyId", "name");

-- CreateIndex
CREATE INDEX "ClientTagLink_tagId_idx" ON "ClientTagLink"("tagId");

-- CreateIndex
CREATE INDEX "ClientNote_companyId_clientId_idx" ON "ClientNote"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ClientNote_createdById_idx" ON "ClientNote"("createdById");

-- CreateIndex
CREATE INDEX "ClientDebt_companyId_clientId_idx" ON "ClientDebt"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ClientDebt_shopId_idx" ON "ClientDebt"("shopId");

-- CreateIndex
CREATE INDEX "ClientDebt_status_idx" ON "ClientDebt"("status");

-- CreateIndex
CREATE INDEX "ClientDebtRepayment_companyId_clientId_idx" ON "ClientDebtRepayment"("companyId", "clientId");

-- CreateIndex
CREATE INDEX "ClientDebtRepayment_debtId_idx" ON "ClientDebtRepayment"("debtId");

-- CreateIndex
CREATE INDEX "ClientDebtRepayment_createdById_idx" ON "ClientDebtRepayment"("createdById");

-- CreateIndex
CREATE INDEX "ClientCard_companyId_clientId_idx" ON "ClientCard"("companyId", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCard_companyId_number_key" ON "ClientCard"("companyId", "number");

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_registrationShopId_fkey" FOREIGN KEY ("registrationShopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGroup" ADD CONSTRAINT "ClientGroup_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGroupLink" ADD CONSTRAINT "ClientGroupLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientGroupLink" ADD CONSTRAINT "ClientGroupLink_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ClientGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTagLink" ADD CONSTRAINT "ClientTagLink_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTagLink" ADD CONSTRAINT "ClientTagLink_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "ClientTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebt" ADD CONSTRAINT "ClientDebt_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebtRepayment" ADD CONSTRAINT "ClientDebtRepayment_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebtRepayment" ADD CONSTRAINT "ClientDebtRepayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebtRepayment" ADD CONSTRAINT "ClientDebtRepayment_debtId_fkey" FOREIGN KEY ("debtId") REFERENCES "ClientDebt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDebtRepayment" ADD CONSTRAINT "ClientDebtRepayment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCard" ADD CONSTRAINT "ClientCard_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
