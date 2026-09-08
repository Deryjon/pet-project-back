import { BadRequestException } from '@nestjs/common';

export const DEFAULT_MIN_PASSWORD_LENGTH = 8;
export const MIN_SESSION_TIMEOUT_MINUTES = 5;
export const MAX_SESSION_TIMEOUT_MINUTES = 43_200;

type PlatformSettingReader = {
  platformSetting?: {
    findUnique(args: {
      where: { id: string };
      select: { data: true };
    }): Promise<{
      data: unknown;
    } | null>;
  };
};

function asSettings(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function readPlatformSecurityPolicy(db: PlatformSettingReader) {
  const setting = db.platformSetting
    ? await db.platformSetting.findUnique({
        where: { id: 'default' },
        select: { data: true },
      })
    : null;
  const data = asSettings(setting?.data);
  const configuredPasswordLength = Number(data.minPasswordLength);
  const configuredSessionTimeout = Number(data.sessionTimeout);

  return {
    minPasswordLength:
      Number.isInteger(configuredPasswordLength) &&
      configuredPasswordLength >= DEFAULT_MIN_PASSWORD_LENGTH &&
      configuredPasswordLength <= 128
        ? configuredPasswordLength
        : DEFAULT_MIN_PASSWORD_LENGTH,
    sessionTimeoutMinutes:
      Number.isInteger(configuredSessionTimeout) &&
      configuredSessionTimeout >= MIN_SESSION_TIMEOUT_MINUTES &&
      configuredSessionTimeout <= MAX_SESSION_TIMEOUT_MINUTES
        ? configuredSessionTimeout
        : null,
  };
}

export async function assertPasswordMeetsPlatformPolicy(
  db: PlatformSettingReader,
  password: string,
) {
  const policy = await readPlatformSecurityPolicy(db);
  if (Array.from(password).length < policy.minPasswordLength) {
    throw new BadRequestException(
      `Password must contain at least ${policy.minPasswordLength} characters`,
    );
  }
}
