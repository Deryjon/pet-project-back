import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppThrottlerGuard } from '../common/app-throttler.guard';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AppModule } from '../app.module';
import { AuthController } from './auth.controller';
import { JwtService } from '@nestjs/jwt';

process.env.JWT_SECRET ??= 'rate-limit-spec-secret';
const sign = (sub: number) =>
  new JwtService({ secret: process.env.JWT_SECRET }).sign({ sub });
const tokenA = `Bearer ${sign(1)}`;
const tokenB = `Bearer ${sign(2)}`;

const proto = AuthController.prototype as unknown as Record<string, object>;

describe('Rate limiting', () => {
  it('guards every route with the throttler', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      AppModule,
    ) as Array<{ provide?: unknown; useClass?: unknown }>;
    expect(providers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provide: APP_GUARD,
          useClass: AppThrottlerGuard,
        }),
      ]),
    );
  });

  it.each(['companyLogin', 'platformLogin', 'platformAuthLogin', 'login'])(
    'keeps the strict login limit on %s',
    (method) => {
      expect(
        Reflect.getMetadata(`${THROTTLER_LIMIT}default`, proto[method]),
      ).toBe(20);
    },
  );

  it('tracks signed-in users by token and anonymous calls by IP', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as {
      getTracker(req: Record<string, unknown>): Promise<string>;
    };
    const a = await guard.getTracker({
      headers: { authorization: tokenA },
      ip: '1.1.1.1',
    });
    const b = await guard.getTracker({
      headers: { authorization: tokenB },
      ip: '1.1.1.1',
    });
    expect(a).toMatch(/^token:/);
    expect(a).not.toBe(b);
    await expect(
      guard.getTracker({ headers: {}, ip: '2.2.2.2' }),
    ).resolves.toBe('2.2.2.2');
  });

  it('counts login attempts per IP whatever Authorization header is sent', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as {
      getTracker(req: Record<string, unknown>): Promise<string>;
    };
    for (const url of [
      '/api/auth/company-login',
      '/api/auth/login',
      '/api/platform/auth/login',
      '/api/Auth/Login',
      '/AUTH/COMPANY-LOGIN/',
      '/api/Platform/Auth/Login?x=1',
    ]) {
      await expect(
        guard.getTracker({
          originalUrl: url,
          headers: { authorization: `Bearer ${Math.random()}` },
          ip: '3.3.3.3',
        }),
      ).resolves.toBe('3.3.3.3');
    }
  });

  it('keeps counting signed-in auth routes per token', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as {
      getTracker(req: Record<string, unknown>): Promise<string>;
    };
    await expect(
      guard.getTracker({
        originalUrl: '/api/auth/me',
        headers: { authorization: tokenA },
        ip: '4.4.4.4',
      }),
    ).resolves.toMatch(/^token:/);
  });

  it('counts a forged or unsigned Authorization header per IP', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as {
      getTracker(req: Record<string, unknown>): Promise<string>;
    };
    const forged = new JwtService({ secret: 'not-ours' }).sign({ sub: 1 });
    for (const authorization of [
      `Bearer ${Math.random()}`,
      `Bearer ${forged}`,
      'garbage',
    ]) {
      await expect(
        guard.getTracker({
          originalUrl: '/api/auth/refresh',
          headers: { authorization },
          ip: '5.5.5.5',
        }),
      ).resolves.toBe('5.5.5.5');
    }
  });
});
