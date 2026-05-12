import { ROLE_PERMISSION_SECTIONS } from './roles.permissions';

export const DEFAULT_CRM_ROLES = [
  {
    externalId: 213642,
    name: 'Админ',
    description: '',
    isAdmin: true,
    permissionSlugs: 'all',
  },
  {
    externalId: 778939,
    name: 'Кассир',
    description: '',
    isAdmin: false,
    permissionSlugs: [
      'new-sale',
      'order-new',
      'order-return',
      'seller-list',
      'manual-discount',
      'all-sales',
      'orders',
      'cash-shifts',
      'cashbox-shifts',
      'cash-shifts-detail',
      'cashbox-operations',
      'gl-transaction-income',
      'gl-transaction-cost',
      'gl-transaction-view',
      'all-clients',
      'clients',
      'client-card',
      'debts',
      'debt-detail',
      'gift-cards',
      'pay-gift-card',
      'sell-gift-card',
      'view-gift-card',
      'catalog',
      'product-list',
    ],
  },
  {
    externalId: 590659,
    name: 'Управляющий магазина',
    description: '',
    isAdmin: false,
    permissionSlugs: [
      'suppliers',
      'supplier-list',
      'supplier-edit',
      'supplier-create',
      'revaluation',
      'revaluation-accept',
      'revaluation-create',
      'revaluation-file',
      'product-revaluation',
      'write-off',
      'write-offs',
      'write-off-create',
      'write-off-finish',
      'transfer',
      'transfers',
      'transfer-create',
      'transfer-check',
      'all-orders',
      'order-payment',
      'order-create',
      'order-accept',
      'order-detail',
      'order-edit',
      'order/return',
      'catalog',
      'product-list',
      'product-create',
      'product-edit',
      'product-price-edit',
      'catalog-statistics',
      'catalog-operations',
      'product-excel-export',
      'inventory',
      'inventory-list',
      'inventory-result',
      'inventory-finish',
      'inventory-create',
      'handbook',
      'new-sale',
      'order-new',
      'order-return',
      'order-debt',
      'manual-discount',
      'seller-list',
      'return-from-another-store',
      'all-sales',
      'orders',
      'show-all-sales',
      'report-print',
      'orders-other-shops',
      'payment-type',
      'cash-shifts',
      'cashbox-shifts',
      'cashbox-open-edit',
      'cash-shifts-detail',
      'cashbox-operations',
      'cashbox-change',
      'gl-transaction-collection',
      'gl-transaction-income',
      'gl-transaction-cost',
      'gl-transaction-view',
      'debts',
      'debt-detail',
      'debt-edit',
      'all-clients',
      'clients',
      'client-card',
      'client-card-edit',
      'clients-group',
      'group-list',
      'group-create',
      'group-edit',
      'promos',
      'promo',
      'promo-action',
      'gift-cards',
      'pay-gift-card',
      'sell-gift-card',
      'view-gift-card',
      'reports-shop',
      'reports-shop-summary',
      'reports-shop-transactions',
      'summary-report',
      'report-products',
      'reports-products-summary',
      'reports-products-leftover',
      'reports-products-efficiency',
      'report-sellers',
      'report-seller',
      'report-seller-products',
      'finance-state',
      'state-view',
      'transactions',
      'transactions-view',
      'transactions-create',
      'settings-shop',
      'shop-list',
      'shop-edit',
      'settings-cashbox',
      'cashbox-list',
      'cashbox-edit',
      'settings-cheque',
      'cheque-list',
      'cheque-edit',
      'settings-payment',
      'currency-list',
      'payment-types',
      'employees',
      'employee-list',
      'dashboard-orders',
      'target',
      'orders-epos',
    ],
  },
  {
    externalId: 765272,
    name: 'Продавец',
    description: '',
    isAdmin: false,
    permissionSlugs: [
      'new-sale',
      'order-new',
      'seller-list',
      'all-sales',
      'orders',
      'all-clients',
      'clients',
      'client-card',
      'catalog',
      'product-list',
      'gift-cards',
      'sell-gift-card',
      'view-gift-card',
    ],
  },
  {
    externalId: 462577,
    name: 'Управляющий компании',
    description: '',
    isAdmin: true,
    permissionSlugs: 'all',
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

  if (missingRoles.length) {
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

  await createDefaultPermissionsForCompany(db, companyId);
}

export async function createDefaultPermissionsForCompany(
  db: any,
  companyId: string,
) {
  const roles = await db.role.findMany({
    where: {
      companyId,
      externalId: {
        in: DEFAULT_CRM_ROLES.map((role) => role.externalId),
      },
    },
    select: {
      id: true,
      externalId: true,
    },
  });
  const permissionsBySlug = buildPermissionIdsBySlug();
  const allPermissionIds = [...new Set([...permissionsBySlug.values()])];
  const defaultRoleByExternalId = new Map<number, (typeof DEFAULT_CRM_ROLES)[number]>(
    DEFAULT_CRM_ROLES.map((role) => [role.externalId, role]),
  );
  const rolePermissions = roles.flatMap((role: { id: string; externalId: number }) => {
    const defaultRole = defaultRoleByExternalId.get(role.externalId);
    if (!defaultRole) {
      return [];
    }

    const permissionIds =
      defaultRole.permissionSlugs === 'all'
        ? allPermissionIds
        : defaultRole.permissionSlugs
            .map((slug) => permissionsBySlug.get(slug))
            .filter((permissionId): permissionId is string => Boolean(permissionId));

    return [...new Set(permissionIds)].map((permissionId) => ({
      roleId: role.id,
      permissionId,
      isActive: true,
    }));
  });

  if (!rolePermissions.length) {
    return;
  }

  await db.rolePermission.createMany({
    data: rolePermissions,
    skipDuplicates: true,
  });
}

function buildPermissionIdsBySlug() {
  const permissions = new Map<string, string>();

  for (const section of ROLE_PERMISSION_SECTIONS) {
    for (const permission of section.permissions) {
      permissions.set(permission.slug, permission.id);

      for (const child of permission.children) {
        permissions.set(child.slug, child.id);
      }
    }
  }

  return permissions;
}
