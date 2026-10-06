import { companyContext } from '../../test/fixtures/request-context';
import { ReportsService } from './reports.service';

const sizeDef = (id: string, code: string) => ({
  id,
  code,
  name: code,
  sortOrder: 1,
  isVariantAxis: true,
});
const variant = (definition: ReturnType<typeof sizeDef>, value: string) => ({
  attributeOptions: [
    {
      valueText: null,
      definition,
      option: { id: `${definition.id}-${value}`, value },
    },
    {
      valueText: null,
      definition: sizeDef('color', 'color'),
      option: { id: 'red', value: 'Red' },
    },
  ],
});

describe('ReportsService sales by attribute', () => {
  const clothing = sizeDef('size-c', 'size_clothing');
  const shoes = sizeDef('size-s', 'size_shoes');

  function setup(items: any[]) {
    const db = {
      attributeDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { id: clothing.id, code: clothing.code, name: 'Размер одежды' },
          { id: shoes.id, code: shoes.code, name: 'Размер обуви' },
        ]),
      },
      saleItem: { findMany: jest.fn().mockResolvedValue(items) },
    };
    const service = new ReportsService(
      db as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    jest
      .spyOn(service as any, 'getContext')
      .mockResolvedValue(companyContext());
    jest
      .spyOn(service as any, 'buildReportWhere')
      .mockResolvedValue({ companyId: 'company-1' });
    return { service, db };
  }

  const item = (saleType: string, v: any, quantity: number, price: number) => ({
    quantity,
    finalPrice: price,
    profitAtSale: price / 2,
    sale: { saleType },
    variant: v,
  });

  it('groups every size grid, subtracts returns and buckets items without a size', async () => {
    const { service, db } = setup([
      item('sale', variant(clothing, 'M'), 2, 200),
      item('sale', variant(clothing, 'M'), 1, 100),
      item('return', variant(clothing, 'M'), 1, 100),
      item('sale', variant(shoes, '42'), 1, 500),
      item('sale', null, 1, 50),
    ]);

    const report = await service.getSalesByAttribute({}, companyContext());

    expect(db.attributeDefinition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1', legacySource: 'size' },
      }),
    );
    expect(report.items).toEqual([
      expect.objectContaining({ value: '42', net_quantity: 1, revenue: 500 }),
      expect.objectContaining({
        value: 'M',
        sold_quantity: 3,
        returned_quantity: 1,
        net_quantity: 2,
        revenue: 200,
      }),
      expect.objectContaining({ value: 'Без значения', revenue: 50 }),
    ]);
    expect(report.items.reduce((sum, row) => sum + row.revenue_share, 0)).toBeCloseTo(100, 0);
  });
});
