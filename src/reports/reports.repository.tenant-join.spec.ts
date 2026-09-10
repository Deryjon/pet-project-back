import { ReportsRepository } from './reports.repository';
import { CompanyRequestContext } from '../auth/request-context';

describe('ReportsRepository tenant-safe shop joins', () => {
  const context: CompanyRequestContext = {
    userId: 1,
    fullName: 'Manager',
    userType: 'company',
    role: 'role-1',
    crmRoleId: 'role-1',
    crmRoleName: 'Manager',
    companyId: 'company-a',
    currentShopId: 'shop-1',
    currentBranchCode: '001',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['001'],
    canSwitchShops: false,
  };

  it.each(['getSaleItemFacts', 'getSellerAggregateRows'] as const)(
    '%s joins a shop through company and branch code',
    async (method) => {
      const db = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const repository = new ReportsRepository(db as any);

      await repository[method]({} as any, context);

      const sql = db.$queryRawUnsafe.mock.calls[0][0] as string;
      expect(sql).toContain('sh."companyId" = s."companyId"');
      expect(sql).toContain('sh."branchCode" = s."branchCode"');
    },
  );

  it('adds a false predicate for an unknown explicitly requested shop', async () => {
    const db = {
      shop: { findMany: jest.fn().mockResolvedValue([]) },
      $queryRawUnsafe: jest.fn().mockResolvedValue([]),
    };
    const repository = new ReportsRepository(db as any);

    await repository.getSaleItemFacts(
      { shopIds: ['missing-shop'] } as any,
      context,
    );

    expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('FALSE');
  });

  it('does not treat an empty company branch allowlist as unrestricted', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const repository = new ReportsRepository(db as any);

    await repository.getSaleItemFacts({} as any, {
      ...context,
      currentShopId: null,
      currentBranchCode: null,
      allowedShopIds: [],
      allowedBranchCodes: [],
    });

    expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('FALSE');
  });
});
