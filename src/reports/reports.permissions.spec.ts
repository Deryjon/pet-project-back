import { Reflector } from '@nestjs/core';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { ANY_PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PERMISSION_ALIASES } from '../auth/role-permissions';
import { getPermissionIdsBySlug } from '../roles/roles.permissions';
import { ReportsController } from './reports.controller';

const SALARY_METHODS = new Set([
  'getSellerSalarySettings',
  'updateSellerSalarySettings',
  'getSellerSalaryReport',
]);

// Route handlers keyed by method name (decorator metadata lives on them).
const proto = ReportsController.prototype as unknown as Record<string, object>;

const reportRoutes = Object.getOwnPropertyNames(proto)
  .filter(
    (method) =>
      method !== 'constructor' &&
      !SALARY_METHODS.has(method) &&
      Reflect.hasMetadata(PATH_METADATA, proto[method]),
  )
  .map((method) => ({ method, handler: proto[method] }));

function idsFor(slug: string) {
  return (PERMISSION_ALIASES[slug] ?? [slug]).flatMap(getPermissionIdsBySlug);
}

describe('Report permissions', () => {
  it('covers every report route', () => {
    expect(reportRoutes.length).toBeGreaterThan(30);
  });

  it.each(reportRoutes)(
    '$method requires PermissionsGuard and known report rights',
    ({ handler }) => {
      expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
        expect.arrayContaining([PermissionsGuard]),
      );
      const slugs = Reflect.getMetadata(ANY_PERMISSIONS_KEY, handler) as
        | string[]
        | undefined;
      expect(slugs?.length).toBeGreaterThan(0);
      for (const slug of slugs ?? []) {
        expect(idsFor(slug).length).toBeGreaterThan(0);
      }
    },
  );
});

describe('PermissionsGuard with AnyPermission', () => {
  const handler = proto.getCustomers;
  const clientSlug = 'reports-clients-summary';

  function run(activeSlugs: string[]) {
    const db = {
      role: { findFirst: jest.fn().mockResolvedValue({ isAdmin: false }) },
      rolePermission: {
        findMany: jest
          .fn()
          .mockResolvedValue(
            activeSlugs
              .flatMap(idsFor)
              .map((permissionId) => ({ permissionId })),
          ),
      },
    };
    const guard = new PermissionsGuard(new Reflector(), db as any);
    const context = {
      getHandler: () => handler,
      getClass: () => ReportsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { crmRoleId: 'role-1', companyId: 'c-1' } }),
      }),
    } as unknown as ExecutionContext;
    return guard.canActivate(context);
  }

  it('lets a role with one right of the section in', async () => {
    await expect(run([clientSlug])).resolves.toBe(true);
  });

  it('refuses a role without any right of the section', async () => {
    await expect(run(['report-sellers'])).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(run([])).rejects.toBeInstanceOf(ForbiddenException);
  });
});
