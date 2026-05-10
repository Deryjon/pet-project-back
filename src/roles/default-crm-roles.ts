export const DEFAULT_CRM_ROLES = [
  { externalId: 213642, name: 'Админ', description: '', isAdmin: true },
  { externalId: 778939, name: 'Кассир', description: '', isAdmin: false },
  {
    externalId: 590659,
    name: 'Управляющий магазина',
    description: '',
    isAdmin: false,
  },
  { externalId: 765272, name: 'Продавец', description: '', isAdmin: false },
  {
    externalId: 462577,
    name: 'Управляющий компании',
    description: '',
    isAdmin: true,
  },
] as const;

export async function createDefaultCrmRolesForCompany(
  db: any,
  companyId: string,
) {
  const existingDefaultRoles = await db.role.findMany({
    where: {
      companyId,
      externalId: {
        in: DEFAULT_CRM_ROLES.map((role) => role.externalId),
      },
    },
    select: {
      externalId: true,
    },
  });
  const existingExternalIds = new Set(
    existingDefaultRoles.map((role: { externalId: number }) => role.externalId),
  );
  const missingRoles = DEFAULT_CRM_ROLES.filter(
    (role) => !existingExternalIds.has(role.externalId),
  );

  if (!missingRoles.length) {
    return;
  }

  await db.role.createMany({
    data: missingRoles.map((role) => ({
      id: `${companyId}:crm-role:${role.externalId}`,
      companyId,
      name: role.name,
      description: role.description,
      isAdmin: role.isAdmin,
      externalId: role.externalId,
    })),
    skipDuplicates: true,
  });
}
