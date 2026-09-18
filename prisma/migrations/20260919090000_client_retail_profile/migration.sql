ALTER TABLE "Client"
ADD COLUMN "clothingSize" TEXT,
ADD COLUMN "shoeSize" TEXT,
ADD COLUMN "marketingAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "marketingConsentAt" TIMESTAMP(3),
ADD COLUMN "marketingConsentSource" TEXT,
ADD COLUMN "marketingRevokedAt" TIMESTAMP(3);

CREATE INDEX "Client_companyId_marketingAllowed_idx"
ON "Client"("companyId", "marketingAllowed");
