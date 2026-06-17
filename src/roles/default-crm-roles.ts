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
      // Новая продажа
      'new-sale',
      'order-new',
      'order-return',
      'order-debt',
      'manual-discount',
      'seller-list',
      'delay-finish',
      // Все продажи
      'all-sales',
      'orders',
      'report-print',
      // Кассовые смены
      'cash-shifts',
      'cashbox-shifts',
      'cashbox-open-edit',
      'cash-shifts-detail',
      // Кассовые операции
      'cashbox-operations',
      'gl-transaction-collection',
      'gl-transaction-income',
      'gl-transaction-cost',
      'gl-transaction-view',
      // Клиенты
      'all-clients',
      'clients',
      'client-card',
      'client-card-edit',
      // Долги
      'debts',
      'debt-detail',
      // Подарочные карты
      'gift-cards',
      'pay-gift-card',
      'sell-gift-card',
      'view-gift-card',
      // Каталог
      'catalog',
      'catalog-operations',
      'product-list',
      // Дашборд
      'dashboard-orders',
    ],
  },
  {
    externalId: 590659,
    name: 'Управляющий магазина',
    description: '',
    isAdmin: false,
    permissionSlugs: [
      // Поставщики
      'suppliers',
      'supplier-list',
      'supplier-edit',
      'supplier-create',
      // Переоценка
      'revaluation',
      'revaluation-accept',
      'revaluation-create',
      'revaluation-file',
      'product-revaluation',
      // Списание
      'write-off',
      'write-offs',
      'write-off-cost',
      'write-off-create',
      'write-off-finish',
      'write-off-delete',
      // Импорт
      'import',
      'import-details',
      'import-retail-price',
      'import-price',
      'import-check',
      'import-create',
      'import-delete',
      // Трансфер
      'transfer',
      'transfers',
      'transfer-create',
      'transfer-check',
      // Заказы поставщику
      'all-orders',
      'order-payment',
      'order-create',
      'order-accept',
      'order-detail',
      'order-edit',
      'order/return',
      // Каталог
      'catalog',
      'catalog-operations',
      'product-list',
      'product-create',
      'product-edit',
      'product-price-edit',
      'product-photo',
      'product-supply-price',
      'product-excel-export',
      'product-bulk-archive',
      'catalog-statistics',
      'bulk-price-tags',
      'bulk-products-fields',
      'bulk-photo',
      'small-quantity-products',
      'price-edit',
      // Инвентаризация
      'inventory',
      'inventory-list',
      'inventory-result',
      'inventory-finish',
      'inventory-create',
      'inventory-block',
      'inventory-delete',
      'inventory-declared',
      'inventory-partial',
      // Справочник
      'handbook',
      // Новая продажа
      'new-sale',
      'order-new',
      'order-return',
      'order-debt',
      'manual-discount',
      'seller-list',
      'delay-finish',
      'return-from-another-store',
      // Все продажи
      'all-sales',
      'orders',
      'show-all-sales',
      'show_deleted_orders',
      'report-print',
      'orders-other-shops',
      'payment-type',
      'order-date',
      'order-client',
      'order-seller',
      'order-delete',
      // Кассовые смены
      'cash-shifts',
      'cashbox-shifts',
      'cashbox-open-edit',
      'cash-shifts-detail',
      // Кассовые операции
      'cashbox-operations',
      'cashbox-change',
      'gl-transaction-collection',
      'gl-transaction-income',
      'gl-transaction-cost',
      'gl-transaction-view',
      // Долги клиентов
      'debts',
      'debt-detail',
      'debt-edit',
      'debt-cancel',
      // Все клиенты
      'all-clients',
      'clients',
      'client-card',
      'client-card-edit',
      'client-delete',
      'clients-download',
      'balance-edit',
      // Программа лояльности
      'loyalty-program',
      'loyalty-setting',
      'loyalty-create',
      'loyalty-edit',
      // Группы клиентов
      'clients-group',
      'group-list',
      'group-create',
      'group-edit',
      // Акции
      'promos',
      'promo',
      'promo-edit',
      'promo-create',
      'promo-action',
      'promo-delete',
      // SMS рассылка
      'sms',
      'sms-view',
      'sms-create',
      // Подарочные карты
      'gift-cards',
      'pay-gift-card',
      'sell-gift-card',
      'view-gift-card',
      // Отчёты — магазин
      'reports-shop',
      'reports-shop-summary',
      'reports-shop-transactions',
      'summary-report',
      // Отчёты — товары
      'report-products',
      'reports-products-summary',
      'reports-products-supplier',
      'reports-products-leftover',
      'reports-products-efficiency',
      'reports-products-import',
      'report-abc-segmentation',
      'report-write-off',
      'report-stocktaking',
      // Отчёты — клиенты
      'report-clients',
      'reports-clients-purchases',
      'reports-clients-summary',
      // Отчёты — финансы
      'report-finance',
      'reports-finances-movements',
      'reports-finances-summary',
      // Отчёты — продавцы
      'report-sellers',
      'report-seller',
      'report-seller-products',
      // Скачать отчёт
      'transactions-report',
      // Финансы — состояние счетов
      'finance-state',
      'state-view',
      // Финансы — категории
      'categories',
      'category-detail',
      // Финансы — транзакции
      'transactions',
      'transactions-view',
      'transactions-check',
      'transactions-create',
      // Настройки — профиль
      'settings-profiles',
      'settings-profile',
      'settings-session',
      // Настройки — магазины
      'settings-shop',
      'shop-list',
      'shop-edit',
      // Настройки — кассы
      'settings-cashbox',
      'cashbox-list',
      'cashbox-edit',
      // Настройки — чеки
      'settings-cheque',
      'cheque-list',
      'cheque-edit',
      // Настройки — валюты и оплаты
      'settings-payment',
      'currency-list',
      'payment-types',
      'payment-type-edit',
      'payment-type-create',
      'payment-type-delete',
      // Управление — сотрудники
      'employees',
      'employee-list',
      'employee-create',
      'employee-edit',
      'employee-block',
      'employee-delete',
      // Управление — роли (просмотр)
      'roles',
      'role-list',
      // Дашборд
      'dashboard-orders',
      'target',
      // EPOS
      'orders-epos',
    ],
  },
  {
    externalId: 765272,
    name: 'Продавец',
    description: '',
    isAdmin: false,
    permissionSlugs: [
      // Новая продажа
      'new-sale',
      'order-new',
      'order-return',
      'order-debt',
      'manual-discount',
      'seller-list',
      'delay-finish',
      // Все продажи (только свои)
      'all-sales',
      'orders',
      // Кассовые смены
      'cash-shifts',
      'cashbox-shifts',
      'cash-shifts-detail',
      // Кассовые операции
      'cashbox-operations',
      'gl-transaction-income',
      'gl-transaction-cost',
      'gl-transaction-view',
      // Долги
      'debts',
      'debt-detail',
      // Клиенты
      'all-clients',
      'clients',
      'client-card',
      'client-card-edit',
      // Каталог
      'catalog',
      'catalog-operations',
      'product-list',
      // Подарочные карты
      'gift-cards',
      'pay-gift-card',
      'sell-gift-card',
      'view-gift-card',
      // Дашборд
      'dashboard-orders',
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
