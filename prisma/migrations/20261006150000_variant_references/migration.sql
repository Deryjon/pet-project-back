-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "ProductSupplyPriceHistory" ADD COLUMN     "variantId" TEXT;

-- AlterTable
ALTER TABLE "SupplierInvoiceItem" ADD COLUMN     "matchedVariantId" TEXT;

-- AlterTable
ALTER TABLE "SupplierProductAlias" ADD COLUMN     "variantId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_variantId_idx" ON "OrderItem"("variantId");

-- CreateIndex
CREATE INDEX "ProductSupplyPriceHistory_variantId_idx" ON "ProductSupplyPriceHistory"("variantId");

-- CreateIndex
CREATE INDEX "SupplierInvoiceItem_matchedVariantId_idx" ON "SupplierInvoiceItem"("matchedVariantId");

-- CreateIndex
CREATE INDEX "SupplierProductAlias_variantId_idx" ON "SupplierProductAlias"("variantId");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierInvoiceItem" ADD CONSTRAINT "SupplierInvoiceItem_matchedVariantId_fkey" FOREIGN KEY ("matchedVariantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupplierProductAlias" ADD CONSTRAINT "SupplierProductAlias_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSupplyPriceHistory" ADD CONSTRAINT "ProductSupplyPriceHistory_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

