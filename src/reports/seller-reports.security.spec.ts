import { SellerReportsService } from './seller-reports.service';
import { ReportsRepository } from './reports.repository';

describe('Salary company isolation', () => {
  function setup(companyId: string | null = 'own') {
    const db = {
      user: {
        findFirst: jest.fn(async ({ where }) =>
          where.companyId === 'own' ? null : { id: 99, companyId: 'foreign' },
        ),
      },
      sellerSalarySettings: {
        upsert: jest.fn().mockResolvedValue({ fixedSalary: 500 }),
      },
    };
    const actor = {
      userType: companyId ? 'company' : 'platform',
      userId: 1,
      companyId,
      fullName: 'Admin',
      role: 'role-1',
      crmRoleId: 'role-1',
      crmRoleName: 'Admin',
      currentShopId: 'shop-1',
      currentBranchCode: 'B1',
      allowedShopIds: ['shop-1'],
      allowedBranchCodes: ['B1'],
      canSwitchShops: false,
    };
    const service = new SellerReportsService(
      {
        getCompanyRequestContext: async () => actor,
        assertAdminAccess: async () => actor,
      } as any,
      new ReportsRepository(db as any),
      {} as any,
      {} as any,
    );
    return { db, service };
  }
  it.each(['getSellerSalarySettings', 'getSellerSalaryReport'] as const)(
    'blocks foreign employee access via %s',
    async (method) => {
      const { db, service } = setup();
      const call =
        method === 'getSellerSalarySettings'
          ? service.getSellerSalarySettings('99', 'Bearer test')
          : service.getSellerSalaryReport('99', {} as any, 'Bearer test');
      await expect(call).rejects.toThrow('Seller not found');
      expect(db.user.findFirst).toHaveBeenCalledWith({
        where: { id: 99, companyId: 'own' },
      });
      expect(db.sellerSalarySettings.upsert).not.toHaveBeenCalled();
    },
  );
  it('blocks a company admin from changing a foreign employee salary', async () => {
    const { db, service } = setup();
    await expect(
      service.updateSellerSalarySettings(
        '99',
        { fixedSalary: 500 },
        'Bearer test',
      ),
    ).rejects.toThrow('Seller not found');
    expect(db.sellerSalarySettings.upsert).not.toHaveBeenCalled();
  });
  it('preserves explicitly authorized platform admin access', async () => {
    const { db, service } = setup(null);
    await expect(
      service.updateSellerSalarySettings(
        '99',
        { fixedSalary: 500 },
        'Bearer test',
      ),
    ).resolves.toMatchObject({ fixedSalary: 500 });
    expect(db.sellerSalarySettings.upsert).toHaveBeenCalled();
  });
});
