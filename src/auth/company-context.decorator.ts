import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  CompanyRequestContext,
  RequestContext,
  requireCompanyContext,
} from './request-context';

/** CompanyAccessGuard must run before resolving this parameter. */
export const CurrentCompanyContext = createParamDecorator(
  (
    _data: unknown,
    executionContext: ExecutionContext,
  ): CompanyRequestContext => {
    const request = executionContext.switchToHttp().getRequest();
    return requireCompanyContext(request.companyContext);
  },
);

/** Authenticated user context for the explicitly supported platform operation. */
export const CurrentRequestContext = createParamDecorator(
  (_data: unknown, executionContext: ExecutionContext): RequestContext => {
    const request = executionContext.switchToHttp().getRequest();
    if (!request.user)
      throw new UnauthorizedException('Missing authenticated context');
    return request.user;
  },
);
