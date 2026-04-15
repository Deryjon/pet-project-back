ALTER TABLE "Product"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "archivedByUserId" INTEGER,
ADD COLUMN "archivedByName" TEXT;
