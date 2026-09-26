CREATE TABLE "ProductBundleComponent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "bundleProductId" INTEGER NOT NULL,
    "componentProductId" INTEGER NOT NULL,
    "componentVariantId" TEXT,
    "quantity" DECIMAL(12,3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBundleComponent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "SaleItem" ADD COLUMN "stockComposition" JSONB;
CREATE UNIQUE INDEX "ProductBundleComponent_bundleProductId_componentProductId_componentVariantId_key"
  ON "ProductBundleComponent"("bundleProductId", "componentProductId", "componentVariantId");
CREATE INDEX "ProductBundleComponent_companyId_bundleProductId_idx" ON "ProductBundleComponent"("companyId", "bundleProductId");
CREATE INDEX "ProductBundleComponent_componentProductId_idx" ON "ProductBundleComponent"("componentProductId");
CREATE INDEX "ProductBundleComponent_componentVariantId_idx" ON "ProductBundleComponent"("componentVariantId");
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_bundleProductId_fkey" FOREIGN KEY ("bundleProductId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_componentProductId_fkey" FOREIGN KEY ("componentProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProductBundleComponent" ADD CONSTRAINT "ProductBundleComponent_componentVariantId_fkey" FOREIGN KEY ("componentVariantId") REFERENCES "ProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
