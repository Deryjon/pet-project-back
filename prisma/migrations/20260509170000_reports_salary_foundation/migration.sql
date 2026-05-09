DO $$
BEGIN
    CREATE TYPE "SalaryCalculationType" AS ENUM (
        'FIXED_ONLY',
        'PROFIT_PERCENT_ONLY',
        'REVENUE_PERCENT_ONLY',
        'FIXED_PLUS_PROFIT',
        'FIXED_PLUS_REVENUE'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "SaleItem"
ADD COLUMN "sellerId" INTEGER,
ADD COLUMN "retailPriceAtSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "finalPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "supplyPriceAtSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "profitAtSale" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN "markupAtSale" DOUBLE PRECISION,
ADD COLUMN "sellerBonusAmount" DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX "SaleItem_sellerId_idx" ON "SaleItem"("sellerId");
CREATE INDEX "SaleItem_productId_idx" ON "SaleItem"("productId");

ALTER TABLE "SaleItem"
ADD CONSTRAINT "SaleItem_sellerId_fkey"
FOREIGN KEY ("sellerId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "SellerSalarySettings" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "fixedSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "calculationType" "SalaryCalculationType" NOT NULL DEFAULT 'FIXED_PLUS_PROFIT',
    "bonusEnabled" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SellerSalarySettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SellerSalarySettings_userId_key"
ON "SellerSalarySettings"("userId");

ALTER TABLE "SellerSalarySettings"
ADD CONSTRAINT "SellerSalarySettings_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
