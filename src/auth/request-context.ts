import { ForbiddenException } from '@nestjs/common';

export type RequestContext = {
  userId: number;
  fullName: string;
  userType: 'company' | 'platform';
  role: string | null;
  crmRoleId: string | null;
  crmRoleName: string | null;
  companyId: string | null;
  currentShopId: string | null;
  currentBranchCode: string | null;
  allowedShopIds: string[];
  allowedBranchCodes: string[];
  canSwitchShops: boolean;
};

export type CompanyRequestContext = RequestContext & {
  userType: 'company';
  companyId: string;
};

export type CompanyContextOptions = {
  requireAvailableShop?: boolean;
};

/** Narrows authenticated context without re-reading credentials or company scope. */
export function requireCompanyContext(
  context: RequestContext | undefined,
  options: CompanyContextOptions = {},
): CompanyRequestContext {
  if (context?.userType !== 'company' || !context.companyId) {
    throw new ForbiddenException('Only company users can access this resource');
  }
  if (options.requireAvailableShop && !context.allowedShopIds.length) {
    throw new ForbiddenException('No available shops for this user');
  }
  return { ...context, userType: 'company', companyId: context.companyId };
}
