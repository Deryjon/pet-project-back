-- Price tag templates had no "default" concept: the print flow silently used
-- whichever template was most recently created (createdAt desc, first row).
-- That's fragile — creating any new template (even a one-off test) silently
-- redirected regular sale-time printing to it. Add an explicit default flag.
ALTER TABLE "PriceTagSetting" ADD COLUMN "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: preserve today's implicit behavior (newest template per company)
-- as the explicit default, so existing setups keep printing the same template
-- they already were.
UPDATE "PriceTagSetting" t
SET "isDefault" = true
WHERE t."createdAt" = (
  SELECT MAX(t2."createdAt")
  FROM "PriceTagSetting" t2
  WHERE t2."companyId" = t."companyId"
);
