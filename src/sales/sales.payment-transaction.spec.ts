import { ConflictException } from '@nestjs/common';
import { SalesService } from './sales.service';

describe('SalesService legacy payment transaction', () => {
  const sale = {
    id: 41,
    number: 'SALE-41',
    companyId: 'company-1',
    userId: 7,
    branchCode: 'B1',
    isDraft: true,
    status: 'draft',
    payableTotal: 100,
    total: 100,
    discountAmount: 0,
    discountPercent: 0,
    clientId: null,
    clientName: null,
    items: [{ productId: 11, quantity: 1, salePrice: 100 }],
  };

  function setup(claimedCount = 1) {
    const persistedSale = { ...sale, isDraft: false, status: 'paid' };
    const tx = {
      sale: {
        updateMany: jest.fn().mockResolvedValue({ count: claimedCount }),
        update: jest.fn().mockResolvedValue(persistedSale),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValueOnce(sale)
          .mockResolvedValue(persistedSale),
      },
    };
    const prisma = {
      sale: { findUnique: jest.fn().mockResolvedValue(sale) },
      $transaction: jest.fn((operation: (client: unknown) => unknown) =>
        operation(tx),
      ),
    };
    const telegram = { notifySale: jest.fn().mockResolvedValue(undefined) };
    const service = new SalesService(
      prisma as any,
      {} as any,
      {} as any,
      telegram as any,
    );
    const stockPosting = {
      companyId: 'company-1',
      branchCode: 'B1',
      lowStockSettings: { enabled: false, threshold: 0 },
      lowStockCrossings: [],
    };

    jest.spyOn(service as any, 'getRequestContext').mockResolvedValue({
      userId: 7,
      companyId: 'company-1',
      allowedShopIds: ['shop-1'],
    });
    jest.spyOn(service as any, 'assertSaleAccess').mockImplementation(() => {});
    jest.spyOn(service as any, 'recalculateSale').mockResolvedValue(sale);
    jest
      .spyOn(service as any, 'resolveScopedBranchCode')
      .mockResolvedValue('B1');
    jest
      .spyOn(service as any, 'resolveSaleClientPayload')
      .mockResolvedValue({ clientId: null, clientName: null });
    jest
      .spyOn(service as any, 'validatePaymentAmounts')
      .mockImplementation(() => {});
    jest
      .spyOn(service as any, 'resolvePaymentMethod')
      .mockResolvedValue('cash');
    jest
      .spyOn(service as any, 'finalizeSaleItemSnapshots')
      .mockResolvedValue(undefined);
    const writeOff = jest
      .spyOn(service as any, 'writeOffSaleItemsFromStock')
      .mockResolvedValue(stockPosting);
    jest
      .spyOn(service as any, 'createDebtForFinalizedSale')
      .mockResolvedValue(null);
    jest
      .spyOn(service as any, 'refreshClientSalesAggregates')
      .mockResolvedValue(undefined);
    const notifyCrossings = jest
      .spyOn(service as any, 'notifySaleStockCrossings')
      .mockResolvedValue(undefined);
    jest
      .spyOn(service as any, 'toSaleListItem')
      .mockReturnValue({ id: sale.id });

    return {
      service,
      prisma,
      tx,
      writeOff,
      notifyCrossings,
      stockPosting,
    };
  }

  it('claims, writes off, closes and creates debt in one serializable transaction', async () => {
    const { service, prisma, tx, writeOff, notifyCrossings, stockPosting } =
      setup();

    await service.pay(41, {}, 'Bearer test');

    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: { id: 41, isDraft: true },
      data: { status: 'processing' },
    });
    expect(writeOff).toHaveBeenCalledWith(sale, 'B1', tx, false);
    expect(tx.sale.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 41 },
        data: expect.objectContaining({ status: 'paid', isDraft: false }),
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
    expect(notifyCrossings).toHaveBeenCalledWith(stockPosting);
  });

  it('does not write off stock when another request already claimed the draft', async () => {
    const { service, writeOff, notifyCrossings } = setup(0);

    await expect(service.pay(41, {}, 'Bearer test')).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(writeOff).not.toHaveBeenCalled();
    expect(notifyCrossings).not.toHaveBeenCalled();
  });

  it('uses the same atomic transaction for the order-payment compatibility route', async () => {
    const { service, prisma, tx, writeOff } = setup();

    await service.payOrder('41', {}, 'Bearer test');

    expect(writeOff).toHaveBeenCalledWith(sale, undefined, tx, false);
    expect(tx.sale.updateMany).toHaveBeenCalledWith({
      where: { id: 41, isDraft: true },
      data: { status: 'processing' },
    });
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
    });
  });
});
