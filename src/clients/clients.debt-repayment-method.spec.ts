import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../test/fixtures/request-context';
import { ClientsService } from './clients.service';

describe('ClientsService repayment payment method', () => {
  function setup(paymentType: { id: string; name: string } | null) {
    const debt: any = {
      id: 'debt-1',
      companyId: 'company-1',
      clientId: 'client-1',
      saleId: 9,
      shopId: null,
      amountUzs: new Prisma.Decimal(100),
      remainingAmountUzs: new Prisma.Decimal(100),
      repaidAmountUzs: new Prisma.Decimal(0),
      dueDate: null,
      status: 'unpaid',
      comment: null,
      receiptUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const repaymentCreate = jest.fn();
    const tx: any = {
      clientDebt: {
        findFirst: jest.fn(async () => debt),
        updateMany: jest.fn(async () => ({ count: 1 })),
        aggregate: jest.fn(async () => ({ _sum: { remainingAmountUzs: new Prisma.Decimal(40) } })),
      },
      clientDebtRepayment: { findFirst: jest.fn(), create: repaymentCreate },
      client: { update: jest.fn() },
    };
    const prisma: any = {
      client: { findFirst: jest.fn(async () => ({ id: 'client-1' })) },
      companyPaymentType: { findFirst: jest.fn(async () => paymentType) },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const telegram = { notifyDebtRepaid: jest.fn().mockResolvedValue(undefined) };
    const service = new ClientsService(
      prisma,
      { toIsoForCompany: (date: Date) => date.toISOString() } as any,
      telegram as any,
    );
    return { service, prisma, repaymentCreate, telegram };
  }

  it('refuses a repayment without a payment method', async () => {
    const { service, prisma } = setup({ id: 'pt-cash', name: 'Наличные' });
    await expect(
      service.repayDebt('client-1', 'debt-1', { amount_uzs: 60 }, testContext()),
    ).rejects.toThrow('Выберите способ оплаты');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a payment method of another company', async () => {
    const { service, prisma } = setup(null);
    await expect(
      service.repayDebt('client-1', 'debt-1', { amount_uzs: 60, payment_method: 'foreign' }, testContext()),
    ).rejects.toThrow('Способ оплаты не найден');
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('stores the method and shop with the repayment and notifies', async () => {
    const { service, repaymentCreate, telegram } = setup({ id: 'pt-card', name: 'Карта' });
    const result = await service.repayDebt(
      'client-1',
      'debt-1',
      { amount_uzs: 60, payment_method: 'pt-card' },
      testContext({ currentBranchCode: 'B1' } as any),
    );
    expect(result.remaining_amount_uzs).toBe(40);
    expect(repaymentCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        paymentMethod: 'pt-card',
        paymentMethodName: 'Карта',
        branchCode: 'B1',
      }),
    });
    expect(telegram.notifyDebtRepaid).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 60, remaining: 40, paymentMethodName: 'Карта', branchCode: 'B1', saleId: 9 }),
    );
  });
});
