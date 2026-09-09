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
