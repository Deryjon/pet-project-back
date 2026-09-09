import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { UsersService } from './users.service';

describe('UsersService.getCompanyRequestContext', () => {
  function setup(context: Record<string, unknown> | Error) {
    const service = new UsersService({} as any, {} as any);
    jest.spyOn(service, 'getRequestContext').mockImplementation(async () => {
      if (context instanceof Error) {
        throw context;
      }
      return context as any;
    });
    return service;
  }

  const companyContext = {
    userId: 7,
    fullName: 'Cashier',
    userType: 'company',
    role: 'cashier-role',
    crmRoleId: 'cashier-role',
    crmRoleName: 'Cashier',
    companyId: 'company-1',
    currentShopId: 'shop-1',
    currentBranchCode: 'B1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
    canSwitchShops: false,
  };

  it('returns a narrowed company context', async () => {
    const service = setup(companyContext);

    await expect(
      service.getCompanyRequestContext('Bearer valid'),
    ).resolves.toEqual(companyContext);
  });

  it('rejects platform users at the company boundary', async () => {
    const service = setup({
      ...companyContext,
      userType: 'platform',
      companyId: null,
    });

    await expect(
      service.getCompanyRequestContext('Bearer platform'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('can require at least one available shop', async () => {
    const service = setup({
      ...companyContext,
      allowedShopIds: [],
      allowedBranchCodes: [],
    });

    await expect(
      service.getCompanyRequestContext('Bearer valid', {
        requireAvailableShop: true,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('preserves authentication failures instead of returning a nullable context', async () => {
    const service = setup(new UnauthorizedException('Missing token'));

    await expect(service.getCompanyRequestContext()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
