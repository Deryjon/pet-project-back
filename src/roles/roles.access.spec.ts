import { UnauthorizedException } from '@nestjs/common';
import { RolesService } from './roles.service';

// RolesController has no route guards: authorization happens inside the
// service through UsersService. This spec pins that every endpoint is gated
// before any database access.
describe('RolesService access control', () => {
  function createService() {
    const denied = new UnauthorizedException('denied');
    const usersService = {
      assertAdminAccess: jest.fn().mockRejectedValue(denied),
      assertRolePermissionsReadAccess: jest.fn().mockRejectedValue(denied),
    };
    const prisma = new Proxy(
      {},
      {
        get: () => {
          throw new Error('database must not be touched before auth');
        },
      },
    );
    return new RolesService(prisma as any, usersService as any);
  }

  const calls: Array<[string, (s: RolesService) => Promise<unknown>]> = [
    ['create', (s) => s.create({ name: 'x' }, undefined)],
    ['findAll', (s) => s.findAll(undefined, undefined)],
    ['findOne', (s) => s.findOne('1', undefined, undefined)],
    ['getPermissions', (s) => s.getPermissions('1', undefined, undefined)],
    ['update', (s) => s.update('1', {}, undefined, undefined)],
    [
      'updatePermissions',
      (s) => s.updatePermissions('1', {}, undefined, undefined),
    ],
    ['remove', (s) => s.remove('1', undefined, undefined)],
  ];

  it.each(calls)('%s rejects unauthenticated callers', async (_name, call) => {
    await expect(call(createService())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
