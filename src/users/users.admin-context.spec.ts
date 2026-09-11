import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { companyContext } from '../../test/fixtures/request-context';
import { RequestContext } from '../auth/request-context';
import { UsersService } from './users.service';

describe('UsersService.assertAdminContext', () => {
  function setup(role: { isAdmin: boolean } | null = null) {
    const findFirst = jest.fn().mockResolvedValue(role);
    const service = new UsersService({ role: { findFirst } } as any, {} as any);
    const authenticate = jest.spyOn(service as any, 'getAuthenticatedUser');
    return { service, findFirst, authenticate };
  }

  it('checks the active admin role inside the authenticated company without reading a token', async () => {
    const { service, findFirst, authenticate } = setup({ isAdmin: true });
    const actor = companyContext();
    await expect(service.assertAdminContext(actor)).resolves.toBe(actor);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: actor.crmRoleId, companyId: actor.companyId, deletedAt: 0 },
      select: { isAdmin: true },
    });
    expect(authenticate).not.toHaveBeenCalled();
  });

  it.each([null, { isAdmin: false }])(
    'rejects a missing, foreign, deleted or non-admin role (%j)',
    async (role) => {
      const { service } = setup(role);
      await expect(
        service.assertAdminContext(companyContext()),
      ).rejects.toThrow(ForbiddenException);
    },
  );

  it.each(['platform_admin', 'superadmin'])(
    'preserves platform role %s',
    async (role) => {
      const { service, findFirst, authenticate } = setup();
      const actor: RequestContext = {
        ...companyContext(),
        userType: 'platform',
        companyId: null,
        role,
      };
      await expect(service.assertAdminContext(actor)).resolves.toBe(actor);
      expect(findFirst).not.toHaveBeenCalled();
      expect(authenticate).not.toHaveBeenCalled();
    },
  );

  it('does not grant platform access to a company role named platform_admin', async () => {
    const { service } = setup({ isAdmin: false });
    await expect(
      service.assertAdminContext(companyContext({ role: 'platform_admin' })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects other platform roles', async () => {
    const { service } = setup();
    await expect(
      service.assertAdminContext({
        ...companyContext(),
        userType: 'platform',
        companyId: null,
        role: 'support',
      }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('rejects missing authenticated context', async () => {
    const { service } = setup();
    await expect(service.assertAdminContext(undefined as any)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
