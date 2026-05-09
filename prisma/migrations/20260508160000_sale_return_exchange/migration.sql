ALTER TABLE "Sale"
ADD COLUMN "saleType" TEXT NOT NULL DEFAULT 'sale',
ADD COLUMN "parentSaleId" INTEGER;

CREATE INDEX "Sale_parentSaleId_idx" ON "Sale"("parentSaleId");
CREATE INDEX "Sale_saleType_idx" ON "Sale"("saleType");

ALTER TABLE "Sale"
ADD CONSTRAINT "Sale_parentSaleId_fkey"
FOREIGN KEY ("parentSaleId") REFERENCES "Sale"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
