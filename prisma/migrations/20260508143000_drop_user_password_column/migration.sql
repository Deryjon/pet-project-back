UPDATE "User"
SET "passwordHash" = "password"
WHERE "passwordHash" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "passwordHash" SET NOT NULL;

ALTER TABLE "User"
DROP COLUMN "password";
