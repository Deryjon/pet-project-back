import { CompanyRequestContext } from '../../src/auth/request-context';

export function companyContext(
  overrides: Partial<CompanyRequestContext> = {},
): CompanyRequestContext {
  return {
    userId: 7,
    fullName: 'Test user',
    userType: 'company',
    role: 'role-1',
    crmRoleId: 'role-1',
    crmRoleName: 'Manager',
    companyId: 'company-1',
    currentShopId: 'shop-1',
    currentBranchCode: 'B1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
    canSwitchShops: false,
    ...overrides,
  };
}
