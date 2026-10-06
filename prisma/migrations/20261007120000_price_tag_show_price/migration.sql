-- Price-tag templates can leave the price off (e.g. clothing tags).
ALTER TABLE "PriceTagSetting" ADD COLUMN "showPrice" BOOLEAN NOT NULL DEFAULT true;
