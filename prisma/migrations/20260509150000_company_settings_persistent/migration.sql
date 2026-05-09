ALTER TABLE "Shop"
ADD COLUMN "address" TEXT,
ADD COLUMN "facebook" TEXT,
ADD COLUMN "instagram" TEXT,
ADD COLUMN "phoneNumbers" JSONB,
ADD COLUMN "telegram" TEXT,
ADD COLUMN "website" TEXT,
ADD COLUMN "workingHours" JSONB;

ALTER TABLE "Cashbox"
ADD COLUMN "chequeId" TEXT,
ADD COLUMN "ePos" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "webKassa" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "CountryReference" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CountryReference_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CountryReference_code_key" ON "CountryReference"("code");

CREATE TABLE "TimeZoneReference" (
    "id" TEXT NOT NULL,
    "countryId" TEXT,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "gmtOffset" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TimeZoneReference_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "TimeZoneReference_countryId_idx" ON "TimeZoneReference"("countryId");

ALTER TABLE "TimeZoneReference"
ADD CONSTRAINT "TimeZoneReference_countryId_fkey"
FOREIGN KEY ("countryId") REFERENCES "CountryReference"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "CompanyProfileSetting" (
    "companyId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyProfileSetting_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "CompanyProfileSetting"
ADD CONSTRAINT "CompanyProfileSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyTariffSetting" (
    "companyId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyTariffSetting_pkey" PRIMARY KEY ("companyId")
);

ALTER TABLE "CompanyTariffSetting"
ADD CONSTRAINT "CompanyTariffSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CompanyCurrencySetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "currencyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "isoCode" TEXT NOT NULL,
    "exchangeRate" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "precision" INTEGER NOT NULL DEFAULT 0,
    "isEditable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CompanyCurrencySetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CompanyCurrencySetting_companyId_key" ON "CompanyCurrencySetting"("companyId");

ALTER TABLE "CompanyCurrencySetting"
ADD CONSTRAINT "CompanyCurrencySetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoyaltyProgramSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT '',
    "cashbackPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "bonusPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "levels" JSONB NOT NULL,
    "hasCustomerBalance" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomerDebt" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LoyaltyProgramSetting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LoyaltyProgramSetting_companyId_key" ON "LoyaltyProgramSetting"("companyId");

ALTER TABLE "LoyaltyProgramSetting"
ADD CONSTRAINT "LoyaltyProgramSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MeasurementUnitSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT NOT NULL,
    "precision" TEXT NOT NULL,
    "isEditable" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MeasurementUnitSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MeasurementUnitSetting_companyId_idx" ON "MeasurementUnitSetting"("companyId");

ALTER TABLE "MeasurementUnitSetting"
ADD CONSTRAINT "MeasurementUnitSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PriceTagSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "length" DOUBLE PRECISION NOT NULL,
    "barcodeType" TEXT NOT NULL,
    "barcodeTypeId" TEXT NOT NULL,
    "properties" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PriceTagSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PriceTagSetting_companyId_idx" ON "PriceTagSetting"("companyId");

ALTER TABLE "PriceTagSetting"
ADD CONSTRAINT "PriceTagSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChequeSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasLogo" BOOLEAN NOT NULL DEFAULT false,
    "logoImage" JSONB NOT NULL,
    "hasInformationBlock" BOOLEAN NOT NULL DEFAULT true,
    "hasAdditionalInfo" BOOLEAN NOT NULL DEFAULT true,
    "hasLowerBlock" BOOLEAN NOT NULL DEFAULT true,
    "displayText" TEXT NOT NULL,
    "chequeItems" JSONB NOT NULL,
    "hasBarCode" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL DEFAULT 'cheque',
    "hasAdditionalImage" BOOLEAN NOT NULL DEFAULT false,
    "additionalImage" JSONB NOT NULL,
    "hasCustomerDebt" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomerBalance" BOOLEAN NOT NULL DEFAULT false,
    "printedWithBillz" BOOLEAN NOT NULL DEFAULT true,
    "logoUrl" TEXT NOT NULL DEFAULT '',
    "width" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "length" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "xAxis" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "yAxis" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "logo" TEXT NOT NULL DEFAULT '',
    "compact" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ChequeSetting_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChequeSetting_companyId_idx" ON "ChequeSetting"("companyId");

ALTER TABLE "ChequeSetting"
ADD CONSTRAINT "ChequeSetting_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
