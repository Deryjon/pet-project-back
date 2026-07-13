-- CreateEnum
CREATE TYPE "ProductTier" AS ENUM ('BUDGET', 'MID', 'PREMIUM');

-- AlterTable: analog grouping for the upsell metric
ALTER TABLE "Product" ADD COLUMN "productGroupId" TEXT;
ALTER TABLE "Product" ADD COLUMN "tier" "ProductTier";

CREATE INDEX "Product_companyId_productGroupId_idx" ON "Product"("companyId", "productGroupId");

-- AlterTable: opt-in flag for the seller-analytics Telegram report
ALTER TABLE "TelegramSubscriber" ADD COLUMN "notifySellerAnalytics" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TelegramSubscriber_companyId_notifySellerAnalytics_idx" ON "TelegramSubscriber"("companyId", "notifySellerAnalytics");
