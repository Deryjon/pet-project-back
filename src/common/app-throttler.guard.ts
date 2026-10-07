import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * Decision (audit): counts requests per signed-in user token rather than per
 * IP. Several cashiers of one shop usually share a public IP, so a per-IP
 * limit would throttle the whole shop; anonymous requests (logins, public
 * webhooks) still count per client IP.
 */
// Express routes case-insensitively, so /api/Auth/Login reaches the login
// handler and must be recognised here too.
const LOGIN_PATH =
  /\/(auth\/(company-|platform-)?login|platform\/auth\/login)(\/|\?|$)/i;

const BEARER = /^Bearer\s+(.+)$/i;

let tokenVerifier: JwtService | null = null;

function getTokenVerifier() {
  tokenVerifier ??= new JwtService({ secret: process.env.JWT_SECRET });
  return tokenVerifier;
}

@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Login routes are anonymous: a made-up Authorization header must not buy
    // a fresh bucket there, so they always count per IP. Signed-in auth
    // routes (me, refresh, logout) keep counting per token.
    const path = String(req.originalUrl ?? req.url ?? '');
    if (LOGIN_PATH.test(path)) {
      return super.getTracker(req);
    }
    const token = this.extractVerifiedToken(req.headers?.authorization);
    if (token) {
      const digest = createHash('sha256')
        .update(token)
        .digest('hex')
        .slice(0, 32);
      return Promise.resolve(`token:${digest}`);
    }
    return super.getTracker(req);
  }

  /**
   * Only a token signed by us gets its own bucket; any other header value
   * would let a client mint a fresh bucket per request.
   */
  protected extractVerifiedToken(authorization: unknown): string | null {
    if (typeof authorization !== 'string' || !authorization.trim()) {
      return null;
    }
    const value = authorization.trim();
    const token = (value.match(BEARER)?.[1] ?? value).trim();
    if (!token || !process.env.JWT_SECRET) {
      return null;
    }
    try {
      // An expired session still belongs to its user; it gets a 401 later.
      getTokenVerifier().verify(token, { ignoreExpiration: true });
      return token;
    } catch {
      return null;
    }
  }
}
