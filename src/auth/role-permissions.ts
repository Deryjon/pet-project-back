import { getPermissionIdsBySlug } from '../roles/roles.permissions';

/**
 * Operation keys that are satisfied by ANY of the listed permission slugs.
 * A plain slug (no alias) must be granted as-is.
 */
export const PERMISSION_ALIASES: Record<string, string[]> = {
  'sales.read': [
    'all-sales',
    'orders',
    'show-all-sales',
    'show_deleted_orders',
    'orders-other-shops',
  ],
  'orders.read': [
    'new-sale',
    'order-new',
    'all-sales',
    'orders',
    'show-all-sales',
    'show_deleted_orders',
    'orders-other-shops',
  ],
  'orders.create': ['new-sale', 'order-new'],
  'orders.cancel': ['new-sale', 'order-new', 'all-sales'],
  'orders.complete': ['new-sale', 'order-new'],
  'payments.create': ['new-sale', 'order-new'],
  'payment-types.read': ['payment-types', 'new-sale', 'order-new'],
  'cashboxes.read': ['cashbox-list', 'new-sale', 'order-new'],
  'cashboxes.manage': ['cashbox-list', 'cashbox-create'],
  // Mirrors the frontend route map in composables/useAccessControl.ts.
  'imports.read': [
    'import',
    'import-details',
    'import-create',
    'import-check',
    'import-delete',
  ],
  'imports.write': ['import-create', 'import-check'],
  'transfers.read': [
    'transfer',
    'transfers',
    'transfer-create',
    'transfer-check',
  ],
};

export function resolvePermissionIds(permission: string) {
  const normalizedPermission = permission.trim().toLowerCase();
  const aliasPermissions = PERMISSION_ALIASES[normalizedPermission] ?? [
    normalizedPermission,
  ];
  const resolvedPermissionIds = aliasPermissions.flatMap((item) =>
    getPermissionIdsBySlug(item),
  );

  if (resolvedPermissionIds.length > 0) {
    return [...new Set(resolvedPermissionIds)];
  }

  return [permission.trim()];
}

type RoleAccessDb = {
  role: {
    findFirst(args: any): Promise<{ isAdmin: boolean } | null>;
  };
  rolePermission: {
    findMany(args: any): Promise<Array<{ permissionId: string }>>;
  };
};

export type RoleAccess = {
  isAdmin: boolean;
  activePermissionIds: Set<string>;
};

/** Returns null when the role does not exist in the company or is deleted. */
export async function loadRoleAccess(
  db: RoleAccessDb,
  roleId: string,
  companyId: string | null,
): Promise<RoleAccess | null> {
  const role = await db.role.findFirst({
    where: {
      id: roleId,
      companyId,
      deletedAt: 0,
    },
    select: {
      isAdmin: true,
    },
  });

  if (!role) return null;

  if (role.isAdmin) {
    return { isAdmin: true, activePermissionIds: new Set() };
  }

  const activePermissions = await db.rolePermission.findMany({
    where: {
      roleId,
      isActive: true,
    },
    select: {
      permissionId: true,
    },
  });

  return {
    isAdmin: false,
    activePermissionIds: new Set(
      activePermissions.map((item) => item.permissionId),
    ),
  };
}

export function roleAccessAllows(access: RoleAccess, permissions: string[]) {
  if (access.isAdmin) return true;

  return permissions.every((permission) =>
    resolvePermissionIds(permission).some((permissionId) =>
      access.activePermissionIds.has(permissionId),
    ),
  );
}

/** In-service check for rights that depend on request data, not just the route. */
export async function contextHasPermissions(
  db: RoleAccessDb,
  context: { crmRoleId: string | null; companyId: string | null },
  permissions: string[],
) {
  if (!context.crmRoleId) return false;

  const access = await loadRoleAccess(db, context.crmRoleId, context.companyId);
  return access ? roleAccessAllows(access, permissions) : false;
}
