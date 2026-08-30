CREATE SEQUENCE "SupplierInvoice_intId_seq" START 13000000;

ALTER TABLE "SupplierInvoice" ADD COLUMN "intId" INTEGER;

WITH "orderedInvoices" AS (
  SELECT
    "id",
    (12999999 + ROW_NUMBER() OVER (ORDER BY "createdAt" ASC, "id" ASC))::INTEGER AS "intId"
  FROM "SupplierInvoice"
)
UPDATE "SupplierInvoice" AS "invoice"
SET "intId" = "orderedInvoices"."intId"
FROM "orderedInvoices"
WHERE "invoice"."id" = "orderedInvoices"."id";

SELECT setval(
  '"SupplierInvoice_intId_seq"',
  COALESCE(MAX("intId"), 13000000),
  COUNT(*) > 0
)
FROM "SupplierInvoice";

ALTER TABLE "SupplierInvoice"
  ALTER COLUMN "intId" SET DEFAULT nextval('"SupplierInvoice_intId_seq"'),
  ALTER COLUMN "intId" SET NOT NULL;

ALTER SEQUENCE "SupplierInvoice_intId_seq" OWNED BY "SupplierInvoice"."intId";

CREATE UNIQUE INDEX "SupplierInvoice_intId_key" ON "SupplierInvoice"("intId");
