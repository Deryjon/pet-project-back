import { UnauthorizedException } from '@nestjs/common';

export function extractAccessToken(authorization?: string) {
  const value = authorization?.trim();

  if (!value) {
    throw new UnauthorizedException('Missing bearer token');
  }

  const bearerMatch = value.match(/^Bearer\s+(.+)$/i);
  const token = (bearerMatch?.[1] ?? value).trim();

  if (!token || /^Bearer$/i.test(token)) {
    throw new UnauthorizedException('Missing bearer token');
  }

  return token;
}
