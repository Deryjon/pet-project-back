import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService company boundary', () => {
  function createService(getCompanyRequestContext = jest.fn()) {
    return new SalesService(
      {} as any,
      {} as any,
      { getCompanyRequestContext } as any,
      {} as any,
    );
  }

  const context = {
    userType: 'company',
    companyId: 'company-1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
  };

  it('does not expose a sale from another company when branchCode is absent', () => {
    const service = createService();

    expect(() =>
      (service as any).assertSaleAccess(
        { companyId: 'company-2', branchCode: null },
        context,
      ),
    ).toThrow(NotFoundException);
  });

  it('accepts a sale only inside both company and branch scope', () => {
    const service = createService();

    expect(() =>
      (service as any).assertSaleAccess(
        { companyId: 'company-1', branchCode: 'B1' },
        context,
      ),
    ).not.toThrow();
    expect(() =>
      (service as any).assertSaleAccess(
        { companyId: 'company-1', branchCode: 'B2' },
        context,
      ),
    ).toThrow(NotFoundException);
  });

  it('propagates missing authentication instead of using a null context', async () => {
    const getCompanyRequestContext = jest
      .fn()
      .mockRejectedValue(new UnauthorizedException('Missing token'));
    const service = createService(getCompanyRequestContext);

    await expect((service as any).getRequestContext()).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getCompanyRequestContext).toHaveBeenCalledWith(undefined);
  });
});
