-- Add nullable client relation to sales while preserving legacy clientName usage.
ALTER TABLE "Sale"
ADD COLUMN "clientId" TEXT;

CREATE INDEX "Sale_clientId_idx" ON "Sale"("clientId");

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_clientId_fkey"
FOREIGN KEY ("clientId") REFERENCES "Client"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
