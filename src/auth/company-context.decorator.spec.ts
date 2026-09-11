import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { CurrentCompanyContext } from './company-context.decorator';
import { CompanyAccessGuard } from './guards/company-access.guard';
import { CompanyRequestContext } from './request-context';

class ContextConsumer {
  handle(@CurrentCompanyContext() context: CompanyRequestContext) {
    return context;
  }
}

const metadata = Reflect.getMetadata(
  ROUTE_ARGS_METADATA,
  ContextConsumer,
  'handle',
);
const factory = (Object.values(metadata)[0] as any).factory;
const execution = (req: unknown) =>
  ({
    switchToHttp: () => ({ getRequest: () => req }),
  }) as ExecutionContext;

describe('guard-provided company context', () => {
  const user = {
    userType: 'company',
    companyId: 'company-a',
    userId: 1,
    allowedShopIds: [],
    allowedBranchCodes: [],
  };

  it('preserves empty shop scope from guard through parameter extraction', () => {
    const req: any = { user };
    new CompanyAccessGuard().canActivate(execution(req));
    expect(factory(undefined, execution(req))).toEqual(user);
    expect(factory(undefined, execution(req)).allowedShopIds).toEqual([]);
  });

  it('does not accept body/header context or user without company guard', () => {
    const req = {
      user,
      body: { companyContext: user },
      headers: { companyContext: user },
    };
    expect(() => factory(undefined, execution(req))).toThrow(
      ForbiddenException,
    );
  });

  it.each([
    undefined,
    { ...user, userType: 'platform' },
    { ...user, companyId: null },
  ])('rejects invalid context before assigning it', (invalidUser) => {
    const req: any = { user: invalidUser };
    expect(() => new CompanyAccessGuard().canActivate(execution(req))).toThrow(
      ForbiddenException,
    );
    expect(req.companyContext).toBeUndefined();
  });
});
