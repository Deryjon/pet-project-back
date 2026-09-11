import { Prisma } from '@prisma/client';
import { companyContext as testContext } from '../../test/fixtures/request-context';
import { ClientsService } from './clients.service';

describe('ClientsService.repayDebt concurrency guard', () => {
  it('does not allow concurrent repayments to exceed the remaining debt', async () => {
    let remaining = new Prisma.Decimal(100);
    let repaid = new Prisma.Decimal(0);
    const baseDebt: any = {
      id: 'debt-1',
      companyId: 'company-1',
      clientId: 'client-1',
      saleId: null,
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
    const tx: any = {
      clientDebt: {
        findFirst: jest.fn(async () => ({
          ...baseDebt,
          remainingAmountUzs: remaining,
          repaidAmountUzs: repaid,
        })),
        updateMany: jest.fn(async ({ where, data }) => {
          if (
            !remaining.eq(where.remainingAmountUzs) ||
            !repaid.eq(where.repaidAmountUzs)
          ) {
            return { count: 0 };
          }
          remaining = remaining.minus(data.remainingAmountUzs.decrement);
          repaid = repaid.plus(data.repaidAmountUzs.increment);
          return { count: 1 };
        }),
        aggregate: jest.fn(async () => ({
          _sum: { remainingAmountUzs: remaining },
        })),
      },
      clientDebtRepayment: {
        findFirst: jest.fn(async () => null),
        create: jest.fn(async () => ({})),
      },
      client: { update: jest.fn(async () => ({})) },
    };
    const prisma: any = {
      client: { findFirst: jest.fn(async () => ({ id: 'client-1' })) },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const companySettings: any = {
      toIsoForCompany: jest.fn((date) => date.toISOString()),
    };

    const service = new ClientsService(prisma, companySettings);

    const results = await Promise.allSettled([
      service.repayDebt(
        'client-1',
        'debt-1',
        { amount_uzs: 60 },
        testContext(),
      ),
      service.repayDebt(
        'client-1',
        'debt-1',
        { amount_uzs: 60 },
        testContext(),
      ),
    ]);

    expect(
      results.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === 'rejected'),
    ).toHaveLength(1);
    expect(tx.clientDebtRepayment.create).toHaveBeenCalledTimes(1);
    expect(remaining.toNumber()).toBe(40);
    expect(repaid.toNumber()).toBe(60);
  });
});
