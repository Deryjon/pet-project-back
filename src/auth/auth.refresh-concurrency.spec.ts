import { AuthService } from './auth.service';

describe('AuthService refresh rotation', () => {
  it('atomically consumes one refresh session and rolls back the losing branch', async () => {
    const originalSession = {
      id: 'session-old',
      userId: 7,
      refreshTokenHash: '',
      expiresAt: new Date(Date.now() + 60_000),
      revokedAt: null as Date | null,
      replacedById: null as string | null,
    };
    const persisted = new Map<string, any>();
    let refreshCounter = 0;
    const tx: any = {
      authSession: {
        create: jest.fn(async ({ data }) => {
          persisted.set(data.id, { ...data, revokedAt: null });
          return data;
        }),
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            originalSession.revokedAt ||
            originalSession.id !== where.id ||
            originalSession.refreshTokenHash !== where.refreshTokenHash
          )
            return { count: 0 };
          originalSession.revokedAt = data.revokedAt;
          originalSession.replacedById = data.replacedById;
          return { count: 1 };
        }),
      },
    };
    const db: any = {
      authSession: {
        findUnique: jest.fn(async () => ({ ...originalSession })),
        create: jest.fn(),
      },
      $transaction: jest.fn(async (operation) => {
        const snapshot = new Map(persisted);
        try {
          return await operation(tx);
        } catch (error) {
          persisted.clear();
          for (const [key, value] of snapshot) persisted.set(key, value);
          throw error;
        }
      }),
    };
    const jwt: any = {
      verifyAsync: jest.fn(async () => ({
        sub: 7,
        sessionId: 'session-old',
        type: 'refresh',
      })),
      signAsync: jest.fn(async (_payload, options) =>
        options?.secret
          ? `refresh-${++refreshCounter}`
          : `access-${refreshCounter}`,
      ),
      decode: jest.fn(() => ({ exp: Math.floor(Date.now() / 1000) + 3600 })),
    };
    const users: any = {
      prepareAuthenticatedUser: jest.fn(async () => ({
        id: 7,
        userType: 'company',
        crmRoleId: 'role-1',
        platformRole: null,
        phoneNumber: '+998',
      })),
      toAuthProfile: jest.fn(async () => ({
        user_type: 'company',
        company_id: 'company-1',
        current_shop_id: 'shop-1',
        current_shop: { branch_code: '001' },
      })),
    };
    const config: any = {
      get: jest.fn((key) =>
        key === 'JWT_REFRESH_SECRET' ? 'secret' : undefined,
      ),
    };
    const service = new AuthService(users, jwt, config, db, {} as any);
    originalSession.refreshTokenHash = (service as any).hashToken(
      'old-refresh',
    );

    const results = await Promise.allSettled([
      service.refresh({ refresh_token: 'old-refresh' }),
      service.refresh({ refresh_token: 'old-refresh' }),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(originalSession.replacedById).toBeTruthy();
    expect(persisted.has(originalSession.replacedById!)).toBe(true);
    expect(persisted.size).toBe(1);
    expect(db.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});
