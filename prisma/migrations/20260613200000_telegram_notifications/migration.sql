-- CreateTable
CREATE TABLE "TelegramSubscriber" (
    "id" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "notifyOnSale" BOOLEAN NOT NULL DEFAULT true,
    "branchCode" TEXT,
    "linkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramSubscriber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramLinkToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "companyId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramSubscriber_chatId_key" ON "TelegramSubscriber"("chatId");
CREATE UNIQUE INDEX "TelegramSubscriber_userId_key" ON "TelegramSubscriber"("userId");
CREATE INDEX "TelegramSubscriber_companyId_idx" ON "TelegramSubscriber"("companyId");
CREATE INDEX "TelegramSubscriber_companyId_notifyOnSale_idx" ON "TelegramSubscriber"("companyId", "notifyOnSale");

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLinkToken_token_key" ON "TelegramLinkToken"("token");
CREATE INDEX "TelegramLinkToken_token_idx" ON "TelegramLinkToken"("token");

-- AddForeignKey
ALTER TABLE "TelegramSubscriber" ADD CONSTRAINT "TelegramSubscriber_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
