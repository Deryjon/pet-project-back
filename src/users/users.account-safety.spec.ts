import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { promises as fsPromises } from 'fs';
import { UsersService } from './users.service';

jest.mock('../common/platform-security-policy', () => ({
  assertPasswordMeetsPlatformPolicy: jest.fn().mockResolvedValue(undefined),
}));

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0,
]);

function createService() {
  const userUpdate = jest.fn((args: unknown) => ({ op: 'user.update', args }));
  const sessionUpdateMany = jest.fn((args: unknown) => ({
    op: 'authSession.updateMany',
    args,
  }));
  const prisma: any = {
    user: { update: userUpdate, findFirst: jest.fn().mockResolvedValue(null) },
    authSession: { updateMany: sessionUpdateMany },
    $transaction: jest.fn((ops: unknown) => Promise.resolve(ops)),
  };
  const jwtService: any = { decode: jest.fn() };
  const service = new UsersService(prisma, jwtService);
  return { service, prisma, jwtService, userUpdate, sessionUpdateMany };
}

const admin: any = {
  id: 7,
  userType: 'company',
  companyId: 'company-a',
};

function companyUser(overrides: Record<string, unknown> = {}): any {
  return {
    id: 9,
    userType: 'company',
    companyId: 'company-a',
    crmRole: { id: 'role-a' },
    shopAccesses: [{ shopId: 'shop-a', shop: { id: 'shop-a' } }],
    currentShopId: 'shop-a',
    currentShop: { id: 'shop-a', branchCode: 'A1' },
    canSwitchShops: false,
    avatarUrl: null,
    ...overrides,
  };
}

describe('UsersService account safety', () => {
  afterEach(() => jest.restoreAllMocks());

  describe('self-protection', () => {
    it('refuses to delete the acting admin', async () => {
      const { service, prisma } = createService();
      jest
        .spyOn(service, 'findByIdOrThrow')
        .mockResolvedValue(companyUser({ id: admin.id }));
      jest.spyOn(service as any, 'canManageUser').mockReturnValue(true);

      await expect(service.remove(admin.id, admin)).rejects.toThrow(
        'You cannot delete your own account',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses to block the acting admin but allows blocking others', async () => {
      const { service, userUpdate } = createService();
      jest
        .spyOn(service, 'findByIdOrThrow')
        .mockResolvedValue(companyUser({ id: admin.id }));
      jest.spyOn(service as any, 'canManageUser').mockReturnValue(true);
      jest.spyOn(service as any, 'toListItem').mockResolvedValue({});

      await expect(
        service.updateStatus(admin.id, { is_active: false }, admin),
      ).rejects.toThrow('You cannot block your own account');
      expect(userUpdate).not.toHaveBeenCalled();

      await expect(
        service.updateStatus(9, { is_active: false }, admin),
      ).resolves.toEqual(expect.objectContaining({ message: 'User blocked' }));
    });

    it('refuses is_active=false on the acting admin through update', async () => {
      const { service } = createService();
      jest
        .spyOn(service, 'findByIdOrThrow')
        .mockResolvedValue(companyUser({ id: admin.id }));
      jest.spyOn(service as any, 'canManageUser').mockReturnValue(true);
      jest
        .spyOn(service as any, 'resolveCompanyIdForActor')
        .mockResolvedValue('company-a');

      await expect(
        service.update(admin.id, { is_active: false }, admin),
      ).rejects.toThrow('You cannot block your own account');
    });
  });

  describe('sessions after a password change', () => {
    it('revokes every session of a user whose password an admin reset', async () => {
      const { service, prisma, sessionUpdateMany } = createService();
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(companyUser());
      jest.spyOn(service as any, 'canManageUser').mockReturnValue(true);
      jest
        .spyOn(service as any, 'resolveCompanyIdForActor')
        .mockResolvedValue('company-a');
      jest.spyOn(service, 'findOneResponse').mockResolvedValue({} as any);

      await service.update(9, { password: 'new-password-1' }, admin);

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { userId: 9, revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });

    it('keeps the current session and revokes the others on a self change', async () => {
      const { service, prisma, jwtService, sessionUpdateMany } =
        createService();
      const passwordHash = await bcrypt.hash('old-password', 4);
      jest
        .spyOn(service as any, 'getAuthenticatedUser')
        .mockResolvedValue({ id: 9, passwordHash });
      jwtService.decode.mockReturnValue({ sub: 9, sessionId: 'session-1' });

      await service.updatePassword('Bearer token', {
        current_password: 'old-password',
        new_password: 'new-password-1',
      });

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(sessionUpdateMany).toHaveBeenCalledWith({
        where: { userId: 9, revokedAt: null, id: { not: 'session-1' } },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });

  describe('company move', () => {
    it('drops the old company shop accesses and role when only company_id changes', async () => {
      const { service, userUpdate } = createService();
      jest.spyOn(service, 'findByIdOrThrow').mockResolvedValue(companyUser());
      jest.spyOn(service as any, 'canManageUser').mockReturnValue(true);
      jest
        .spyOn(service as any, 'resolveCompanyIdForActor')
        .mockResolvedValue('company-b');
      jest
        .spyOn(service as any, 'resolveAllowedShopsForWrite')
        .mockResolvedValue([{ id: 'shop-b', branchCode: 'B1' }]);
      jest
        .spyOn(service as any, 'resolveCurrentShopForWrite')
        .mockResolvedValue({ id: 'shop-b', branchCode: 'B1' });
      jest.spyOn(service, 'findOneResponse').mockResolvedValue({} as any);
      const platformAdmin: any = { id: 1, userType: 'platform' };

      await service.update(9, { company_id: 'company-b' }, platformAdmin);

      const { data } = userUpdate.mock.calls[0][0] as { data: any };
      expect(data.crmRole).toEqual({ disconnect: true });
      expect(data.shopAccesses).toEqual({
        deleteMany: {},
        createMany: { data: [{ shopId: 'shop-b' }] },
      });
    });
  });

  describe('avatar upload', () => {
    const oldAvatar = 'http://x/uploads/avatars/old.png';

    it('keeps the old avatar when the new file is not an image', async () => {
      const { service, userUpdate } = createService();
      jest
        .spyOn(service as any, 'getAuthenticatedUser')
        .mockResolvedValue({ id: 9, avatarUrl: oldAvatar });
      const remove = jest
        .spyOn(service as any, 'removeStoredAvatar')
        .mockResolvedValue(undefined);

      await expect(
        service.uploadAvatar('Bearer token', {
          originalname: 'a.png',
          mimetype: 'image/png',
          size: 10,
          buffer: Buffer.from('<html></html>'),
        }),
      ).rejects.toThrow(BadRequestException);
      expect(remove).not.toHaveBeenCalled();
      expect(userUpdate).not.toHaveBeenCalled();
    });

    it('removes the old avatar only after saving the new one', async () => {
      const { service, userUpdate } = createService();
      jest
        .spyOn(service as any, 'getAuthenticatedUser')
        .mockResolvedValue({ id: 9, avatarUrl: oldAvatar });
      const order: string[] = [];
      userUpdate.mockImplementation(() => {
        order.push('db');
        return Promise.resolve({}) as any;
      });
      jest
        .spyOn(service as any, 'removeStoredAvatar')
        .mockImplementation(() => {
          order.push('remove');
          return Promise.resolve();
        });
      jest.spyOn(fsPromises, 'mkdir').mockResolvedValue(undefined);
      jest.spyOn(fsPromises, 'writeFile').mockResolvedValue(undefined);

      await service.uploadAvatar('Bearer token', {
        originalname: 'a.png',
        mimetype: 'image/png',
        size: PNG_BYTES.length,
        buffer: PNG_BYTES,
      });

      expect(order).toEqual(['db', 'remove']);
    });
  });
});
