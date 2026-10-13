import { Prisma } from '@prisma/client';
import { SalesService } from './sales.service';

describe('SalesService debt repayments in the sales summary', () => {
  const repayment = (id: string, amount: number, method: string | null, branchCode: string | null) => ({
    id,
    createdAt: new Date('2026-10-13T08:00:00Z'),
    amountUzs: new Prisma.Decimal(amount),
    paymentMethod: method ? `pt-${method}` : null,
    paymentMethodName: method,
    branchCode,
    clientId: 'client-1',
    client: { firstName: 'Али', lastName: 'Валиев', phone: '+998' },
    createdBy: { firstName: 'Кассир', lastName: '' },
    debt: { sale: { number: 'S-1' } },
  });

  function setup() {
    const findMany = jest.fn(async () => [
      repayment('r1', 100, 'Наличные', 'B1'),
      repayment('r2', 50, 'Карта', 'B1'),
      repayment('r3', 30, 'Наличные', 'B2'),
      repayment('r4', 20, null, null),
    ]);
    const prisma: any = { clientDebtRepayment: { findMany } };
    const service = new SalesService(prisma, {} as any, {} as any);
    jest.spyOn(service as any, 'buildShopLookupByBranchCodes').mockResolvedValue(
      new Map([
        ['B1', { shop_id: 'shop-1', shop_name: 'Чиланзар' }],
        ['B2', { shop_id: 'shop-2', shop_name: 'Юнусабад' }],
      ]),
    );
    const context = { companyId: 'company-1', allowedBranchCodes: ['B1', 'B2'] };
    return { service, findMany, context };
  }

  it('sums repayments per payment method and lists them', async () => {
    const { service, findMany, context } = setup();
    const range = { createdAt: { gte: new Date('2026-10-13'), lt: new Date('2026-10-14') } };
    const stats = await (service as any).buildDebtRepaymentStats(context, [range], {});

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-1', createdAt: range.createdAt }),
      }),
    );
    expect(stats.debt_repayment_amount).toBe(200);
    expect(stats.debt_repayments_by_method).toEqual({ Наличные: 130, Карта: 50, 'Не указан': 20 });
    expect(stats.debt_repayments[0]).toEqual(
      expect.objectContaining({
        amount: 100,
        payment_method_name: 'Наличные',
        client_name: 'Али Валиев',
        shop_name: 'Чиланзар',
        sale_number: 'S-1',
      }),
    );
  });

  it('follows the shop and payment filters of the list', async () => {
    const { service, context } = setup();
    const byShop = await (service as any).buildDebtRepaymentStats(context, [], { shop: 'Чиланзар' });
    expect(byShop.debt_repayment_amount).toBe(150);
    const byMethod = await (service as any).buildDebtRepaymentStats(context, [], { payment: 'pt-Наличные' });
    expect(byMethod.debt_repayment_amount).toBe(130);
  });

  it('shows nothing on the deleted-documents tab', async () => {
    const { service, findMany, context } = setup();
    const stats = await (service as any).buildDebtRepaymentStats(context, [], { scope: 'deleted' });
    expect(stats.debt_repayment_amount).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });
});
