import { ReportsRepository } from './reports.repository';

describe('ReportsRepository tenant-safe shop joins', () => {
  it.each(['getSaleItemFacts', 'getSellerAggregateRows'] as const)(
    '%s joins a shop through company and branch code',
    async (method) => {
      const db = {
        $queryRawUnsafe: jest.fn().mockResolvedValue([]),
      };
      const repository = new ReportsRepository(db as any);

      await repository[method]({} as any, { companyId: 'company-a' });

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

    await repository.getSaleItemFacts({ shopIds: ['missing-shop'] } as any, {
      companyId: 'company-a',
      allowedBranchCodes: ['001'],
    });

    expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('FALSE');
  });

  it('does not treat an empty company branch allowlist as unrestricted', async () => {
    const db = { $queryRawUnsafe: jest.fn().mockResolvedValue([]) };
    const repository = new ReportsRepository(db as any);

    await repository.getSaleItemFacts({} as any, {
      companyId: 'company-a',
      allowedBranchCodes: [],
    });

    expect(db.$queryRawUnsafe.mock.calls[0][0]).toContain('FALSE');
  });
});
