import { BadRequestException } from '@nestjs/common';
import {
  assertPasswordMeetsPlatformPolicy,
  readPlatformSecurityPolicy,
} from './platform-security-policy';

describe('platform security policy', () => {
  it('uses safe defaults when settings are absent', async () => {
    const db = {
      platformSetting: { findUnique: jest.fn().mockResolvedValue(null) },
    };

    await expect(readPlatformSecurityPolicy(db)).resolves.toEqual({
      minPasswordLength: 8,
      sessionTimeoutMinutes: null,
    });
  });

  it('enforces the configured password length', async () => {
    const db = {
      platformSetting: {
        findUnique: jest.fn().mockResolvedValue({
          data: { minPasswordLength: 12, sessionTimeout: 60 },
        }),
      },
    };

    await expect(
      assertPasswordMeetsPlatformPolicy(db, 'too-short'),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(readPlatformSecurityPolicy(db)).resolves.toEqual({
      minPasswordLength: 12,
      sessionTimeoutMinutes: 60,
    });
  });
});
