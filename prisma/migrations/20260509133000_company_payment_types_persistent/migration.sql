CREATE TABLE "CompanyPaymentType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "isEditable" BOOLEAN NOT NULL DEFAULT true,
    "dontShowInMakePayment" BOOLEAN NOT NULL DEFAULT false,
    "dontShowInSettings" BOOLEAN NOT NULL DEFAULT false,
    "isCashPaymentType" BOOLEAN NOT NULL DEFAULT false,
    "paymentTypeId" TEXT NOT NULL,
    "paymentTypeName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyPaymentType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyPaymentType_companyId_name_key"
ON "CompanyPaymentType"("companyId", "name");

CREATE INDEX "CompanyPaymentType_companyId_idx"
ON "CompanyPaymentType"("companyId");

ALTER TABLE "CompanyPaymentType"
ADD CONSTRAINT "CompanyPaymentType_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
