import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { PermissionsGuard } from './permissions.guard';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CompanyAccessGuard } from './company-access.guard';
import { PERMISSIONS_KEY } from '../permissions.decorator';
import { getPermissionIdsBySlug } from '../../roles/roles.permissions';
import { SupplierInvoicesController } from '../../imports/controllers/supplier-invoices.controller';
import { SuppliersController } from '../../imports/controllers/suppliers.controller';
import { ClientsController } from '../../clients/clients.controller';
import { SalesController } from '../../sales/sales.controller';
import { WarehouseController } from '../../warehouse/warehouse.controller';
import { CashboxesController } from '../../modules/cashboxes/cashboxes.controller';
import { PaymentTypesController } from '../../modules/payments/payment-types.controller';
import { OrdersController } from '../../modules/orders/orders.controller';
import { DashboardController } from '../../dashboard/dashboard.controller';
import { DEFAULT_CRM_ROLES } from '../../roles/default-crm-roles';

const controllers = [
  SupplierInvoicesController,
  SuppliersController,
  ClientsController,
  SalesController,
  WarehouseController,
  CashboxesController,
  PaymentTypesController,
  OrdersController,
  DashboardController,
];

const permissionAliases: Record<string, string[]> = {
  'orders.read': ['new-sale', 'order-new', 'all-sales'],
  'orders.create': ['new-sale', 'order-new'],
  'orders.cancel': ['new-sale', 'order-new', 'all-sales'],
  'orders.complete': ['new-sale', 'order-new'],
  'payments.create': ['new-sale', 'order-new'],
  'payment-types.read': ['payment-types', 'new-sale', 'order-new'],
  'cashboxes.read': ['cashbox-list', 'new-sale', 'order-new'],
};

function permissionIdsFor(slug: string) {
  return (permissionAliases[slug] ?? [slug]).flatMap(getPermissionIdsBySlug);
}
const routes = controllers.flatMap((controller) =>
  Object.getOwnPropertyNames(controller.prototype)
    .filter(
      (method) =>
        method !== 'constructor' &&
        Reflect.hasMetadata(PATH_METADATA, controller.prototype[method]),
    )
    .map((method) => ({
      controller,
      method,
      handler: controller.prototype[method],
    })),
);

describe('Operation permission matrix', () => {
  it.each(controllers)(
    'requires authentication, company context and permissions for %p',
    (controller) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual(
        expect.arrayContaining([
          JwtAuthGuard,
          CompanyAccessGuard,
          PermissionsGuard,
        ]),
      );
    },
  );
  it.each(routes)(
    '$controller.name.$method rejects a role without rights and accepts the operation right',
    async ({ controller, handler }) => {
      const permissions = new Reflector().getAllAndOverride<string[]>(
        PERMISSIONS_KEY,
        [handler, controller],
      );
      expect(permissions?.length).toBeGreaterThan(0);
      const permissionIds = permissions.flatMap((slug) => {
        const ids = permissionIdsFor(slug);
        expect(ids.length).toBeGreaterThan(0);
        return ids;
      });
      const db = {
        role: { findFirst: jest.fn().mockResolvedValue({ isAdmin: false }) },
        rolePermission: { findMany: jest.fn().mockResolvedValue([]) },
      };
      const guard = new PermissionsGuard(new Reflector(), db as any);
      const context = {
        getHandler: () => handler,
        getClass: () => controller,
        switchToHttp: () => ({
          getRequest: () => ({ user: { crmRoleId: 'role', companyId: 'own' } }),
        }),
      } as any;
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Insufficient permissions',
      );
      db.rolePermission.findMany.mockResolvedValue(
        permissionIds.map((permissionId) => ({ permissionId })),
      );
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
  it.each([
    [SupplierInvoicesController, 'commit', 'import-details'],
    [SupplierInvoicesController, 'rollback', 'import-details'],
    [SuppliersController, 'update', 'supplier-list'],
    [ClientsController, 'repayDebt', 'debt-detail'],
    [SalesController, 'processReturn', 'all-sales'],
    [WarehouseController, 'applyInventory', 'inventory-list'],
  ] as const)(
    'read-only permission cannot authorize %p.%s',
    async (controller, method, readPermission) => {
      const db = {
        role: { findFirst: async () => ({ isAdmin: false }) },
        rolePermission: {
          findMany: async () =>
            getPermissionIdsBySlug(readPermission).map((permissionId) => ({
              permissionId,
            })),
        },
      };
      const guard = new PermissionsGuard(new Reflector(), db as any);
      const context = {
        getHandler: () => controller.prototype[method],
        getClass: () => controller,
        switchToHttp: () => ({
          getRequest: () => ({ user: { crmRoleId: 'role', companyId: 'own' } }),
        }),
      } as any;
      await expect(guard.canActivate(context)).rejects.toThrow(
        'Insufficient permissions',
      );
    },
  );
});

describe('Cashier new sale access', () => {
  const cashier = DEFAULT_CRM_ROLES.find((role) => role.name === 'Кассир');
  if (!cashier || !Array.isArray(cashier.permissionSlugs)) {
    throw new Error('Default cashier role is not configured');
  }
  const cashierPermissionIds = (
    cashier.permissionSlugs as readonly string[]
  ).flatMap(getPermissionIdsBySlug);
  const saleHandlers = [
    [SalesController, 'findProductsForNewSale'],
    [SalesController, 'createDraft'],
    [SalesController, 'addItem'],
    [SalesController, 'attachClient'],
    [SalesController, 'pay'],
    [SalesController, 'parkDraft'],
    [SalesController, 'leaveDraft'],
    [SalesController, 'remove'],
    [OrdersController, 'create'],
    [OrdersController, 'findOne'],
    [OrdersController, 'addItem'],
    [OrdersController, 'addPayment'],
    [OrdersController, 'complete'],
    [CashboxesController, 'findAll'],
    [PaymentTypesController, 'findAll'],
    [DashboardController, 'getDashboardReport'],
    [DashboardController, 'saveDashboardSetting'],
  ] as const;

  it.each(saleHandlers)(
    'allows the default cashier to call %p.%s',
    async (controller, method) => {
      const guard = new PermissionsGuard(new Reflector(), {
        role: { findFirst: async () => ({ isAdmin: false }) },
        rolePermission: {
          findMany: async () =>
            cashierPermissionIds.map((permissionId) => ({ permissionId })),
        },
      } as any);
      const context = {
        getHandler: () => controller.prototype[method],
        getClass: () => controller,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { crmRoleId: 'cashier-role', companyId: 'own' },
          }),
        }),
      } as any;

      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );

  it.each(['new-sale', 'order-new'])(
    'keeps the complete sale path usable when a role has only %s',
    async (permissionSlug) => {
      const permissionIds = getPermissionIdsBySlug(permissionSlug);
      const guard = new PermissionsGuard(new Reflector(), {
        role: { findFirst: async () => ({ isAdmin: false }) },
        rolePermission: {
          findMany: async () =>
            permissionIds.map((permissionId) => ({ permissionId })),
        },
      } as any);
      const essentialHandlers = [
        [SalesController, 'findProductsForNewSale'],
        [SalesController, 'createDraft'],
        [SalesController, 'addItem'],
        [SalesController, 'pay'],
        [SalesController, 'remove'],
        [CashboxesController, 'findAll'],
        [PaymentTypesController, 'findAll'],
      ] as const;

      for (const [controller, method] of essentialHandlers) {
        const context = {
          getHandler: () => controller.prototype[method],
          getClass: () => controller,
          switchToHttp: () => ({
            getRequest: () => ({
              user: { crmRoleId: 'cashier-role', companyId: 'own' },
            }),
          }),
        } as any;
        await expect(guard.canActivate(context)).resolves.toBe(true);
      }
    },
  );

  it.each([
    [CashboxesController, 'create'],
    [PaymentTypesController, 'create'],
  ] as const)(
    'does not let cashier sale rights create reference data through %p.%s',
    async (controller, method) => {
      const guard = new PermissionsGuard(new Reflector(), {
        role: { findFirst: async () => ({ isAdmin: false }) },
        rolePermission: {
          findMany: async () =>
            cashierPermissionIds.map((permissionId) => ({ permissionId })),
        },
      } as any);
      const context = {
        getHandler: () => controller.prototype[method],
        getClass: () => controller,
        switchToHttp: () => ({
          getRequest: () => ({
            user: { crmRoleId: 'cashier-role', companyId: 'own' },
          }),
        }),
      } as any;

      await expect(guard.canActivate(context)).rejects.toThrow(
        'Insufficient permissions',
      );
    },
  );
});

describe('Sales detail read access', () => {
  it.each(['new-sale', 'all-sales'])(
    'allows %s to open an order card',
    async (slug) => {
      const guard = new PermissionsGuard(new Reflector(), {
        role: { findFirst: async () => ({ isAdmin: false }) },
        rolePermission: {
          findMany: async () =>
            getPermissionIdsBySlug(slug).map((permissionId) => ({
              permissionId,
            })),
        },
      } as any);
      const context = {
        getHandler: () => SalesController.prototype.findOrder,
        getClass: () => SalesController,
        switchToHttp: () => ({
          getRequest: () => ({ user: { crmRoleId: 'role', companyId: 'own' } }),
        }),
      } as any;
      await expect(guard.canActivate(context)).resolves.toBe(true);
    },
  );
});
