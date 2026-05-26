import { UnauthorizedException } from '@nestjs/common';

export function extractAccessToken(authorization?: string) {
  console.log('extractAccessToken input =', authorization ?? null);
  const value = authorization?.trim();

  if (!value) {
    throw new UnauthorizedException('Заголовок авторизации отсутствует');
  }

  const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch?.[1] ?? value).trim();

  if (!token || /^Bearer$/i.test(token)) {
    throw new UnauthorizedException('Заголовок авторизации некорректный');
  }

  return token;
}
