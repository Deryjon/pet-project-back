DROP INDEX IF EXISTS "Role_externalId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "Role_companyId_externalId_key"
ON "Role"("companyId", "externalId");

WITH defaults AS (
    SELECT * FROM (VALUES
        (1, 213642, 'Админ', '', true),
        (2, 778939, 'Кассир', '', false),
        (3, 590659, 'Управляющий магазина', '', false),
        (4, 765272, 'Продавец', '', false),
        (5, 462577, 'Управляющий компании', '', true)
    ) AS role_defaults("sortOrder", "externalId", "name", "description", "isAdmin")
),
missing_roles AS (
    SELECT
        c."id" AS "companyId",
        d."sortOrder",
        d."externalId",
        d."name",
        d."description",
        d."isAdmin"
    FROM "Company" c
    CROSS JOIN defaults d
    WHERE NOT EXISTS (
        SELECT 1
        FROM "Role" r
        WHERE r."companyId" = c."id"
          AND (r."externalId" = d."externalId" OR r."name" = d."name")
    )
)
INSERT INTO "Role" (
    "id",
    "companyId",
    "name",
    "description",
    "externalId",
    "isAdmin",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT(missing_roles."companyId", ':crm-role:', missing_roles."externalId"),
    missing_roles."companyId",
    missing_roles."name",
    missing_roles."description",
    missing_roles."externalId",
    missing_roles."isAdmin",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM missing_roles
ON CONFLICT DO NOTHING;
