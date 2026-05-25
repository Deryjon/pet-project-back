ALTER TABLE "ClientDebt"
ADD COLUMN "saleId" INTEGER,
ADD COLUMN "comment" TEXT;

CREATE INDEX "ClientDebt_saleId_idx" ON "ClientDebt"("saleId");

ALTER TABLE "ClientDebt"
ADD CONSTRAINT "ClientDebt_saleId_fkey"
FOREIGN KEY ("saleId") REFERENCES "Sale"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
