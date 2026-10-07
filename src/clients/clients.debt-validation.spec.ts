import { companyContext as testContext } from '../../test/fixtures/request-context';
import { ClientsService } from './clients.service';

describe('ClientsService debt input validation', () => {
  function createService(saleFound: boolean) {
    const prisma: any = {
      client: { findFirst: jest.fn().mockResolvedValue({ id: 'client-1' }) },
      sale: {
        findFirst: jest.fn().mockResolvedValue(saleFound ? { id: 5 } : null),
      },
      $transaction: jest.fn(),
    };
    const service = new ClientsService(prisma, {} as any);
    return { service, prisma };
  }

  it.each([undefined, 0, -500000, 0.004, '1e9'])(
    'refuses a debt of %p',
    async (amount) => {
      const { service, prisma } = createService(true);
      await expect(
        service.createDebt(
          'client-1',
          { amount_uzs: amount },
          testContext({ allowedShopIds: [] }),
        ),
      ).rejects.toThrow();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('refuses to link a debt to a sale of another client or company', async () => {
    const { service, prisma } = createService(false);
    await expect(
      service.createDebt(
        'client-1',
        { amount_uzs: 1000, sale_id: 5 },
        testContext({ allowedShopIds: [] }),
      ),
    ).rejects.toThrow('Sale not found');
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 5, clientId: 'client-1' }),
      }),
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
