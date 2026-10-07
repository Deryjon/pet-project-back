import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from './users.service';

describe('UsersService access token check', () => {
  const jwtService = new JwtService({ secret: 'shared-secret' });

  it('refuses a refresh token signed with the access secret', async () => {
    const prisma: any = {
      authSession: { findUnique: jest.fn() },
      user: { findUnique: jest.fn(), findFirst: jest.fn() },
    };
    const service = new UsersService(prisma, jwtService);
    const refreshToken = jwtService.sign({
      sub: 1,
      sessionId: 'session-1',
      type: 'refresh',
    });

    await expect(
      service.getRequestContext(`Bearer ${refreshToken}`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(prisma.authSession.findUnique).not.toHaveBeenCalled();
  });
});
