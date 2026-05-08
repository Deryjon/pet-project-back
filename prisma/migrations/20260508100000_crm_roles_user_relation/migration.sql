-- Align the database with the current CRM role schema used by Prisma Client.
-- The previous company_roles migration created the legacy CompanyRole table only.

CREATE TABLE IF NOT EXISTS "Role" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "externalId" INTEGER NOT NULL,
    "clientTypeId" TEXT NOT NULL DEFAULT '',
    "sessionId" TEXT NOT NULL DEFAULT '',
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "type" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "companyId" TEXT NOT NULL;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "externalId" INTEGER NOT NULL;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "clientTypeId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "sessionId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "isAdmin" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "type" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "deletedAt" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Role" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "roleId" TEXT NOT NULL;
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "permissionId" TEXT NOT NULL;
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "RolePermission" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "crmRoleId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Role_externalId_key" ON "Role"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Role_companyId_name_key" ON "Role"("companyId", "name");
CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permissionId_key" ON "RolePermission"("roleId", "permissionId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'Role_companyId_fkey'
    ) THEN
        ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'User_crmRoleId_fkey'
    ) THEN
        ALTER TABLE "User" ADD CONSTRAINT "User_crmRoleId_fkey"
        FOREIGN KEY ("crmRoleId") REFERENCES "Role"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'RolePermission_roleId_fkey'
    ) THEN
        ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey"
        FOREIGN KEY ("roleId") REFERENCES "Role"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
