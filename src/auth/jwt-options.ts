import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { JwtModuleOptions } from '@nestjs/jwt';

// The client refreshes on a 401 through /auth/refresh, so a short-lived
// access token costs one extra request an hour and limits a leaked token.
export const DEFAULT_ACCESS_TOKEN_TTL = '1h';

let refreshSecretChecked = false;

function warnAboutRefreshSecret(configService: ConfigService, secret: string) {
  if (refreshSecretChecked) return;
  refreshSecretChecked = true;
  const refreshSecret = configService.get<string>('JWT_REFRESH_SECRET');
  if (!refreshSecret || refreshSecret === secret) {
    new Logger('Auth').warn(
      'JWT_REFRESH_SECRET is missing or equal to JWT_SECRET: set a separate value.',
    );
  }
}

/** Access-token signing options shared by every module that needs JwtService. */
export function buildAccessTokenJwtOptions(
  configService: ConfigService,
): JwtModuleOptions {
  const secret = configService.get<string>('JWT_SECRET');
  if (!secret) {
    throw new Error('JWT_SECRET is not configured');
  }
  warnAboutRefreshSecret(configService, secret);
  const expiresIn =
    configService.get<string>('JWT_EXPIRES_IN') ?? DEFAULT_ACCESS_TOKEN_TTL;

  return {
    secret,
    signOptions: {
      expiresIn: expiresIn as never,
    },
  };
}
