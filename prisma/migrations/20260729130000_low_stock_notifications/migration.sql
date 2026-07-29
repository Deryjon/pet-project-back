-- AlterTable
ALTER TABLE "ProductStock" ADD COLUMN "lowStockNotifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TelegramSubscriber" ADD COLUMN "notifyOnLowStock" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "TelegramSubscriber_companyId_notifyOnLowStock_idx" ON "TelegramSubscriber"("companyId", "notifyOnLowStock");
