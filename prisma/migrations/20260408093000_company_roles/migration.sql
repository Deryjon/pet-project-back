-- CreateTable
CREATE TABLE "CompanyRole" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyRole_companyId_code_key" ON "CompanyRole"("companyId", "code");

-- CreateIndex
CREATE INDEX "CompanyRole_companyId_isActive_idx" ON "CompanyRole"("companyId", "isActive");

-- AddForeignKey
ALTER TABLE "CompanyRole" ADD CONSTRAINT "CompanyRole_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Seed default roles for existing companies
INSERT INTO "CompanyRole" ("id", "companyId", "code", "name", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT CONCAT(c."id", ':owner'), c."id", 'owner', 'Owner', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "code") DO NOTHING;

INSERT INTO "CompanyRole" ("id", "companyId", "code", "name", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT CONCAT(c."id", ':admin'), c."id", 'admin', 'Admin', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "code") DO NOTHING;

INSERT INTO "CompanyRole" ("id", "companyId", "code", "name", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT CONCAT(c."id", ':store_manager'), c."id", 'store_manager', 'Store manager', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "code") DO NOTHING;

INSERT INTO "CompanyRole" ("id", "companyId", "code", "name", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT CONCAT(c."id", ':cashier'), c."id", 'cashier', 'Cashier', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "code") DO NOTHING;

INSERT INTO "CompanyRole" ("id", "companyId", "code", "name", "isSystem", "isActive", "createdAt", "updatedAt")
SELECT CONCAT(c."id", ':employee'), c."id", 'employee', 'Employee', true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Company" c
ON CONFLICT ("companyId", "code") DO NOTHING;
