import { DashboardService } from '../dashboard/dashboard.service';
import { PriceTagsController } from '../price-tags/price-tags.controller';
import { ReceiptsController } from '../receipts/receipts.controller';
import { CompanyRequestContext } from './request-context';

describe('company scoped read models', () => {
  const baseContext: CompanyRequestContext = {
    userId: 7,
    fullName: 'Manager',
    userType: 'company',
    role: 'manager-role',
    crmRoleId: 'manager-role',
    crmRoleName: 'Manager',
    companyId: 'company-1',
    currentShopId: 'shop-1',
    currentBranchCode: 'B1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
    canSwitchShops: false,
  };

  function createDashboard(context: CompanyRequestContext = baseContext) {
    const prisma = {
      sale: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const companySettings = {
      getShops: jest.fn().mockResolvedValue({
        shops: [
          { id: 'shop-1', name: 'Allowed', branch_code: 'B1' },
          { id: 'shop-2', name: 'Hidden', branch_code: 'B2' },
        ],
      }),
      getDefaultCurrencyIsoCode: jest.fn().mockReturnValue('UZS'),
      getCompanyPaymentTypes: jest
        .fn()
        .mockResolvedValue({ company_payment_types: [] }),
      formatDateTimeForCompany: jest.fn((date: Date) => date.toISOString()),
    };
    const service = new DashboardService(prisma as any, companySettings as any);
    return { service, prisma, companySettings, context };
  }

  it('rejects a dashboard branch outside the user scope before querying sales', async () => {
    const { service, prisma } = createDashboard();

    await expect(
      service.getDashboardReport(
        { startDate: '2026-09-01', branchCode: 'B2' },
        baseContext,
      ),
    ).rejects.toThrow('Requested branch is not available for this user');
    expect(prisma.sale.findMany).not.toHaveBeenCalled();
  });

  it('keeps an empty dashboard branch scope empty', async () => {
    const { service, prisma, context } = createDashboard({
      ...baseContext,
      currentShopId: null,
      currentBranchCode: null,
      allowedShopIds: [],
      allowedBranchCodes: [],
    });

    const result = await (service.getDashboardReport(
      { startDate: '2026-09-01' },
      context,
    ) as Promise<unknown>);

    const saleQuery = (
      prisma.sale.findMany.mock.calls as unknown[][]
    )[0][0] as {
      where: Record<string, unknown>;
    };
    expect(saleQuery.where.companyId).toBe('company-1');
    expect(saleQuery.where.branchCode).toEqual({ in: [] });
    expect((result as { shops: unknown[] }).shops).toEqual([]);
  });

  it('binds saved dashboard settings to company and user', async () => {
    const { service } = createDashboard();

    const result = await service.saveDashboardSetting(
      {
        report_period: 'month',
        companyId: 'company-foreign',
        userId: 999,
      },
      baseContext,
    );

    const store = service as unknown as {
      dashboardSettingsStore: Map<string, Record<string, unknown>>;
    };
    expect(store.dashboardSettingsStore.get(result.message)).toEqual({
      report_period: 'month',
      companyId: 'company-1',
      userId: 7,
    });
  });

  it.each([
    ['receipts', ReceiptsController],
    ['price tags', PriceTagsController],
  ])('uses the mandatory company context for %s', async (_name, Controller) => {
    const controller =
      Controller === ReceiptsController
        ? new ReceiptsController({} as any)
        : new PriceTagsController({} as any, {} as any);

    const companyScopedController = controller as unknown as {
      requireCompanyId(context: CompanyRequestContext): Promise<string>;
    };
    await expect(
      companyScopedController.requireCompanyId(baseContext),
    ).resolves.toBe('company-1');
  });
});
