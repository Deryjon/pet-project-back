import { ClientsService } from './clients.service';

describe('ClientsService purchases ignore cancelled sales', () => {
  const context = { companyId: 'company-1', allowedShopIds: [] };

  function createService() {
    const prisma: any = {
      sale: { groupBy: jest.fn().mockResolvedValue([]) },
      shop: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ClientsService(prisma, {} as any);
    return { service, prisma };
  }

  it('leaves cancelled sales out of the client card purchases', async () => {
    const { service } = createService();
    const where = await (service as any).completedSaleWhere(
      'client-1',
      context,
    );
    expect(where).toEqual(
      expect.objectContaining({ status: { not: 'cancelled' } }),
    );
  });

  it('leaves cancelled sales out of the client list metrics', async () => {
    const { service, prisma } = createService();
    await (service as any).loadClientMetrics(['client-1'], context);
    expect(prisma.sale.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { not: 'cancelled' } }),
      }),
    );
  });
});
