import { UnauthorizedException } from '@nestjs/common';

export function extractAccessToken(authorization?: string) {
  const value = authorization?.trim();

  if (!value) {
    throw new UnauthorizedException('Authorization header is missing');
  }

  const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch?.[1] ?? value).trim();

  if (!token || /^Bearer$/i.test(token)) {
    throw new UnauthorizedException('Authorization header is invalid');
  }

  return token;
}
