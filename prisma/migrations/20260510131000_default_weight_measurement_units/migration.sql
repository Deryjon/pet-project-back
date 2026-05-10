WITH default_units AS (
    SELECT * FROM (VALUES
        ('12a69bc0-c575-4586-9f0f-76e8295d4139', 'Штука', 'шт', '1', false, true),
        ('6ef2d6c8-6b72-46c9-a633-8f43b2a1d5ef', 'Килограмм', 'кг', '0.001', true, false),
        ('62033f40-46f0-4ef8-b99c-45df3919e7b7', 'Грамм', 'г', '1', true, false)
    ) AS units("baseId", "name", "shortName", "precision", "isEditable", "isDefault")
),
missing_units AS (
    SELECT
        c."id" AS "companyId",
        default_units."baseId",
        default_units."name",
        default_units."shortName",
        default_units."precision",
        default_units."isEditable",
        default_units."isDefault"
    FROM "Company" c
    CROSS JOIN default_units
    WHERE NOT EXISTS (
        SELECT 1
        FROM "MeasurementUnitSetting" unit
        WHERE unit."companyId" = c."id"
          AND LOWER(unit."shortName") = LOWER(default_units."shortName")
    )
)
INSERT INTO "MeasurementUnitSetting" (
    "id",
    "companyId",
    "name",
    "shortName",
    "precision",
    "isEditable",
    "isDefault",
    "createdAt",
    "updatedAt"
)
SELECT
    CONCAT(missing_units."companyId", ':', missing_units."baseId"),
    missing_units."companyId",
    missing_units."name",
    missing_units."shortName",
    missing_units."precision",
    missing_units."isEditable",
    missing_units."isDefault",
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM missing_units
ON CONFLICT ("id") DO NOTHING;
