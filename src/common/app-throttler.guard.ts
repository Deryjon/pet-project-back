import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHash } from 'crypto';

/**
 * Decision (audit): counts requests per signed-in user token rather than per
 * IP. Several cashiers of one shop usually share a public IP, so a per-IP
 * limit would throttle the whole shop; anonymous requests (logins, public
 * webhooks) still count per client IP.
 */
@Injectable()
export class AppThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, any>): Promise<string> {
    // Login and token routes are anonymous: a made-up Authorization header
    // must not buy a fresh bucket there, so they always count per IP.
    const path = String(req.originalUrl ?? req.url ?? '');
    if (/\/(platform\/)?auth\//.test(path)) {
      return super.getTracker(req);
    }
    const authorization = req.headers?.authorization;
    if (typeof authorization === 'string' && authorization.trim()) {
      const digest = createHash('sha256')
        .update(authorization.trim())
        .digest('hex')
        .slice(0, 32);
      return Promise.resolve(`token:${digest}`);
    }
    return super.getTracker(req);
  }
}
