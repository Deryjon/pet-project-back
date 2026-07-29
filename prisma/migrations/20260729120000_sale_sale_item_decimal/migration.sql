-- Sale/SaleItem money & quantity fields: Float (double precision) -> Decimal.
-- USING ...::numeric(p,s) round-trips existing double precision values into
-- the new fixed-point columns without any data loss beyond the intended
-- rounding to the target scale (2dp for money, 3dp for quantity).

ALTER TABLE "Sale"
  ALTER COLUMN "discountPercent" TYPE DECIMAL(12,2) USING "discountPercent"::numeric(12,2),
  ALTER COLUMN "discountAmount" TYPE DECIMAL(12,2) USING "discountAmount"::numeric(12,2),
  ALTER COLUMN "payableTotal" TYPE DECIMAL(12,2) USING "payableTotal"::numeric(12,2),
  ALTER COLUMN "total" TYPE DECIMAL(12,2) USING "total"::numeric(12,2);

ALTER TABLE "SaleItem"
  ALTER COLUMN "quantity" TYPE DECIMAL(12,3) USING "quantity"::numeric(12,3),
  ALTER COLUMN "salePrice" TYPE DECIMAL(12,2) USING "salePrice"::numeric(12,2),
  ALTER COLUMN "lineTotal" TYPE DECIMAL(12,2) USING "lineTotal"::numeric(12,2),
  ALTER COLUMN "retailPriceAtSale" TYPE DECIMAL(12,2) USING "retailPriceAtSale"::numeric(12,2),
  ALTER COLUMN "discountAmount" TYPE DECIMAL(12,2) USING "discountAmount"::numeric(12,2),
  ALTER COLUMN "finalPrice" TYPE DECIMAL(12,2) USING "finalPrice"::numeric(12,2),
  ALTER COLUMN "supplyPriceAtSale" TYPE DECIMAL(12,2) USING "supplyPriceAtSale"::numeric(12,2),
  ALTER COLUMN "profitAtSale" TYPE DECIMAL(12,2) USING "profitAtSale"::numeric(12,2),
  ALTER COLUMN "markupAtSale" TYPE DECIMAL(12,2) USING "markupAtSale"::numeric(12,2),
  ALTER COLUMN "sellerBonusAmount" TYPE DECIMAL(12,2) USING "sellerBonusAmount"::numeric(12,2);
