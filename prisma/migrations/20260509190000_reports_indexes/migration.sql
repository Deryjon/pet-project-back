CREATE INDEX "Sale_createdAt_idx" ON "Sale"("createdAt");
CREATE INDEX "Sale_branchCode_idx" ON "Sale"("branchCode");
CREATE INDEX "Sale_userId_idx" ON "Sale"("userId");
CREATE INDEX "SaleItem_saleId_idx" ON "SaleItem"("saleId");
