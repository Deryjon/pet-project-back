ALTER TABLE "Product"
ADD COLUMN "publicId" TEXT;

UPDATE "Product"
SET "publicId" = LOWER(
  SUBSTRING(MD5('product:' || "id"::text), 1, 8) || '-' ||
  SUBSTRING(MD5('product:' || "id"::text), 9, 4) || '-' ||
  SUBSTRING(MD5('product:' || "id"::text), 13, 4) || '-' ||
  SUBSTRING(MD5('product:' || "id"::text), 17, 4) || '-' ||
  SUBSTRING(MD5('product:' || "id"::text), 21, 12)
)
WHERE "publicId" IS NULL;

ALTER TABLE "Product"
ALTER COLUMN "publicId" SET NOT NULL;

CREATE UNIQUE INDEX "Product_publicId_key" ON "Product"("publicId");
