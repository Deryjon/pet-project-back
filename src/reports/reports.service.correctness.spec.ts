import { ReportsService } from './reports.service';

describe('ReportsService correctness boundaries', () => {
  function createService(db: any) {
    return new ReportsService(
      db,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    ) as any;
  }

  it('loads every page instead of truncating a report at 10,000 rows', async () => {
    const rows = Array.from({ length: 2_001 }, (_, id) => ({ id }));
    const db = {
      product: {
        findMany: jest.fn(async ({ skip, take }) =>
          rows.slice(skip, skip + take),
        ),
      },
    };
    const service = createService(db);
    service.buildProductWhere = jest.fn(async () => ({
      companyId: 'company-1',
    }));

    const result = await service.loadReportProducts({}, {});

    expect(result).toHaveLength(2_001);
    expect(db.product.findMany).toHaveBeenCalledTimes(2);
    expect(db.product.findMany.mock.calls[1][0]).toEqual(
      expect.objectContaining({ skip: 2_000, take: 2_000 }),
    );
  });

  it('turns an explicitly requested unknown shop into an empty DB filter', async () => {
    const db = { shop: { findMany: jest.fn(async () => []) } };
    const service = createService(db);

    const where = await service.buildReportWhere(
      { shop_id: 'missing-shop' },
      { companyId: 'company-1', allowedBranchCodes: ['001'] },
    );

    expect(where.AND).toContainEqual({ branchCode: { in: [] } });
  });

  it('does not fabricate a requested shop when it is absent in the company', async () => {
    const db = { shop: { findMany: jest.fn(async () => []) } };
    const service = createService(db);
    await expect(
      service.loadReportShops(
        { companyId: 'company-1' },
        { shop_id: 'missing-shop' },
      ),
    ).resolves.toEqual([]);
  });
});
