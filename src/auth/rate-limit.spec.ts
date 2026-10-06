import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { ThrottlerGuard } from '@nestjs/throttler';
import { THROTTLER_LIMIT } from '@nestjs/throttler/dist/throttler.constants';
import { AppModule } from '../app.module';
import { AuthController } from './auth.controller';

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
          useClass: ThrottlerGuard,
        }),
      ]),
    );
  });

  it.each(['companyLogin', 'platformLogin', 'platformAuthLogin', 'login'])(
    'keeps the strict login limit on %s',
    (method) => {
      expect(
        Reflect.getMetadata(`${THROTTLER_LIMIT}default`, proto[method]),
      ).toBe(5);
    },
  );
});
