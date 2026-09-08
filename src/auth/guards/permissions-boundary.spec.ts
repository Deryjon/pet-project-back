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

const controllers = [
  SupplierInvoicesController,
  SuppliersController,
  ClientsController,
  SalesController,
  WarehouseController,
];
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
        const ids = slug === 'orders.read'
        ? [...getPermissionIdsBySlug('new-sale'), ...getPermissionIdsBySlug('all-sales')]
        : getPermissionIdsBySlug(slug);
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


describe('Sales detail read access', () => {
  it.each(['new-sale', 'all-sales'])('allows %s to open an order card', async slug => {
    const guard = new PermissionsGuard(new Reflector(), { role: { findFirst: async () => ({ isAdmin: false }) }, rolePermission: { findMany: async () => getPermissionIdsBySlug(slug).map(permissionId => ({ permissionId })) } } as any);
    const context = { getHandler: () => SalesController.prototype.findOrder, getClass: () => SalesController, switchToHttp: () => ({ getRequest: () => ({ user: { crmRoleId: 'role', companyId: 'own' } }) }) } as any;
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
