-- AlterTable: opt-in flag for the login Telegram notification
ALTER TABLE "TelegramSubscriber" ADD COLUMN "notifyOnLogin" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "TelegramSubscriber_companyId_notifyOnLogin_idx" ON "TelegramSubscriber"("companyId", "notifyOnLogin");
