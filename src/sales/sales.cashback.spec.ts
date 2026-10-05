import { BadRequestException, ConflictException } from '@nestjs/common';
import { SalesService } from './sales.service';

function createTx(loyalty: Record<string, unknown> | null, precision = 0) {
  return {
    loyaltyProgramSetting: { findUnique: jest.fn().mockResolvedValue(loyalty) },
    companyCurrencySetting: { findUnique: jest.fn().mockResolvedValue({ precision }) },
    sale: { update: jest.fn(), aggregate: jest.fn() },
    client: { update: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
}

const service = new SalesService({} as any, {} as any, {} as any) as any;
const activeCashback = { isActive: true, type: 'cashback', cashbackPercent: 5, bonusPercent: 0 };
const paidSale = { id: 1, companyId: 'company-1', clientId: 'client-1', payableTotal: 100_000 };

describe('SalesService loyalty cashback', () => {
  it('credits cashback to the client balance when a client is selected', async () => {
    const tx = createTx(activeCashback);

    await expect(service.creditSaleCashback(tx, paidSale)).resolves.toBe(5000);

    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { cashbackAmount: 5000 },
    });
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { balanceUzs: { increment: 5000 } },
    });
  });

  it('neither credits nor records cashback without a client', async () => {
    const tx = createTx(activeCashback);

    await expect(
      service.creditSaleCashback(tx, { ...paidSale, clientId: null }),
    ).resolves.toBe(0);

    expect(tx.sale.update).not.toHaveBeenCalled();
    expect(tx.client.update).not.toHaveBeenCalled();
  });

  it('does nothing when the loyalty program is off', async () => {
    const tx = createTx({ ...activeCashback, isActive: false });

    await expect(service.creditSaleCashback(tx, paidSale)).resolves.toBe(0);
    expect(tx.client.update).not.toHaveBeenCalled();
  });

  it('uses the bonus percent for a bonus program', async () => {
    const tx = createTx({ ...activeCashback, type: 'bonus', bonusPercent: 2 });

    await expect(service.creditSaleCashback(tx, paidSale)).resolves.toBe(2000);
  });

  it('takes back the cashback of the returned part only', async () => {
    const tx = createTx(activeCashback);
    tx.sale.aggregate.mockResolvedValue({ _sum: { cashbackAmount: 0 } });

    const reversed = await service.reverseReturnCashback(
      tx,
      { id: 2, clientId: 'client-1', payableTotal: 40_000 },
      { id: 1, cashbackAmount: 5000, payableTotal: 100_000 },
    );

    expect(reversed).toBe(2000);
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: { cashbackAmount: -2000 },
    });
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { balanceUzs: { decrement: 2000 } },
    });
  });

  it('never takes back more than is left after earlier returns', async () => {
    const tx = createTx(activeCashback);
    // 4500 of the 5000 was already taken back by an earlier return.
    tx.sale.aggregate.mockResolvedValue({ _sum: { cashbackAmount: -4500 } });

    const reversed = await service.reverseReturnCashback(
      tx,
      { id: 3, clientId: 'client-1', payableTotal: 20_000 },
      { id: 1, cashbackAmount: 5000, payableTotal: 100_000 },
    );

    expect(reversed).toBe(500);
  });

  it('undoes the balance movement when a document is cancelled', async () => {
    const tx = createTx(activeCashback);

    await service.undoSaleCashback(tx, { clientId: 'client-1', cashbackAmount: -2000 });

    // Cancelling a return gives the taken-back cashback to the client again.
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { balanceUzs: { decrement: -2000 } },
    });
  });
});

describe('SalesService paying with the loyalty balance', () => {
  it('spends the balance atomically and records it on the sale', async () => {
    const tx = createTx(activeCashback);

    await service.debitCashbackPayment(tx, paidSale, 3000);

    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'client-1', companyId: 'company-1', balanceUzs: { gte: 3000 } },
      data: { balanceUzs: { decrement: 3000 } },
    });
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 1 },
      data: { cashbackPaid: 3000 },
    });
  });

  it('refuses when the balance is not enough', async () => {
    const tx = createTx(activeCashback);
    tx.client.updateMany.mockResolvedValue({ count: 0 });

    await expect(service.debitCashbackPayment(tx, paidSale, 3000)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('requires a client to pay with bonuses', async () => {
    const tx = createTx(activeCashback);

    await expect(
      service.debitCashbackPayment(tx, { ...paidSale, clientId: null }, 3000),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses bonus payment above the payable total', () => {
    expect(() => service.parseCashbackPayment({ cashback_payment: 1000 }, 500)).toThrow(
      BadRequestException,
    );
    expect(service.parseCashbackPayment({}, 500)).toBe(0);
  });

  it('earns cashback only on the part paid with money', async () => {
    const tx = createTx(activeCashback);

    await expect(
      service.creditSaleCashback(tx, { ...paidSale, cashbackPaid: 40_000 }),
    ).resolves.toBe(3000);
  });

  it('records bonuses as their own line in the payment breakdown', () => {
    expect(service.withCashbackPayment(null, 'cash-id', 70_000, false, 30_000)).toEqual({
      paymentMethod: 'cash-id',
      extraPayments: [
        { payment_method: 'cash-id', amount: 70_000 },
        { payment_method: 'loyalty_cashback', amount: 30_000 },
      ],
    });
    expect(service.withCashbackPayment(null, 'cash-id', 0, false, 100_000)).toEqual({
      paymentMethod: 'loyalty_cashback',
      extraPayments: [{ payment_method: 'loyalty_cashback', amount: 100_000 }],
    });
    expect(service.withCashbackPayment(null, 'cash-id', 100_000, false, 0)).toEqual({
      paymentMethod: 'cash-id',
      extraPayments: null,
    });
  });

  it('a return gives the bonus-paid share back to the balance, the rest in money', async () => {
    const tx = createTx(activeCashback);
    tx.sale.aggregate.mockResolvedValue({ _sum: { cashbackPaid: 0 } });

    // Sale of 100 000 paid 30 000 with bonuses; half of it is returned.
    const refunded = await service.refundCashbackPayment(
      tx,
      { id: 2, clientId: 'client-1', payableTotal: 50_000, paymentMethod: 'cash-id' },
      { id: 1, cashbackPaid: 30_000, payableTotal: 100_000 },
    );

    expect(refunded).toBe(15_000);
    expect(tx.sale.update).toHaveBeenCalledWith({
      where: { id: 2 },
      data: {
        cashbackPaid: -15_000,
        extraPayments: [
          { payment_method: 'cash-id', amount: 35_000 },
          { payment_method: 'loyalty_cashback', amount: 15_000 },
        ],
      },
    });
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { balanceUzs: { increment: 15_000 } },
    });
  });

  it('cancelling a bonus-paid sale returns the spent bonuses and takes back the earned cashback', async () => {
    const tx = createTx(activeCashback);

    await service.undoSaleCashback(tx, {
      clientId: 'client-1',
      cashbackAmount: 3000,
      cashbackPaid: 40_000,
    });

    // balance -= (3000 earned - 40 000 spent) => +37 000
    expect(tx.client.update).toHaveBeenCalledWith({
      where: { id: 'client-1' },
      data: { balanceUzs: { decrement: -37_000 } },
    });
  });
});
