import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService company boundary', () => {
  function createService() {
    return new SalesService({} as any, {} as any, {} as any);
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

  it('rejects a missing checked context without parsing credentials', async () => {
    const service = createService();

    await expect((service as any).getRequestContext()).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});
