import { Prisma } from '@prisma/client';
import { ClientsService } from './clients.service';

describe('ClientsService repayment idempotency', () => {
  it('returns the current debt without a second write for a repeated key', async () => {
    const debt: any = {
      id: 'debt-1',
      companyId: 'company-1',
      clientId: 'client-1',
      saleId: null,
      amountUzs: new Prisma.Decimal(100),
      remainingAmountUzs: new Prisma.Decimal(40),
      repaidAmountUzs: new Prisma.Decimal(60),
      dueDate: null,
      status: 'partial',
      comment: null,
      receiptUrl: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx: any = {
      clientDebt: {
        findFirst: jest.fn(async () => debt),
        updateMany: jest.fn(),
      },
      clientDebtRepayment: {
        findFirst: jest.fn(async () => ({ id: 'repayment-1' })),
        create: jest.fn(),
      },
      client: { update: jest.fn() },
    };
    const prisma: any = {
      client: { findFirst: jest.fn(async () => ({ id: 'client-1' })) },
      $transaction: jest.fn((operation) => operation(tx)),
    };
    const service = new ClientsService(
      prisma,
      { toIsoForCompany: (date: Date) => date.toISOString() } as any,
      {
        getRequestContext: async () => ({
          userType: 'company',
          companyId: 'company-1',
          userId: 7,
          allowedShopIds: [],
        }),
      } as any,
    );

    const result = await service.repayDebt(
      'client-1',
      'debt-1',
      { amount_uzs: 60, idempotency_key: 'request-1' },
      'Bearer test',
    );

    expect(result.remaining_amount_uzs).toBe(40);
    expect(tx.clientDebt.updateMany).not.toHaveBeenCalled();
    expect(tx.clientDebtRepayment.create).not.toHaveBeenCalled();
  });
});
