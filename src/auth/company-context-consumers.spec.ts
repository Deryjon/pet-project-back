import { ClientsService } from '../clients/clients.service';
import { CashboxesService } from '../modules/cashboxes/cashboxes.service';
import { PaymentTypesService } from '../modules/payments/payment-types.service';
import { CompanyRequestContext } from './request-context';

describe('company context consumers', () => {
  const companyContext: CompanyRequestContext = {
    userId: 7,
    fullName: 'Cashier',
    userType: 'company',
    role: 'cashier-role',
    crmRoleId: 'cashier-role',
    crmRoleName: 'Cashier',
    companyId: 'company-1',
    currentShopId: 'shop-1',
    currentBranchCode: 'B1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
    canSwitchShops: false,
  };

  it('requires an available shop for cashbox access', async () => {
    const prisma = {
      cashbox: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new CashboxesService(prisma as any);

    await service.findAll(undefined, companyContext);

    await expect(
      service.findAll(undefined, { ...companyContext, allowedShopIds: [] }),
    ).rejects.toThrow('No available shops');
    expect(prisma.cashbox.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          shopId: { in: ['shop-1'] },
        }),
      }),
    );
  });

  it('scopes payment types through the mandatory company context', async () => {
    const prisma = {
      paymentType: {
        upsert: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new PaymentTypesService(prisma as any);

    await service.findAll(companyContext);

    expect(prisma.paymentType.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { companyId: 'company-1', isActive: true },
      }),
    );
  });

  it('keeps the clients shop scope empty when the user has no shops', async () => {
    const contextWithoutShops = {
      ...companyContext,
      currentShopId: null,
      currentBranchCode: null,
      allowedShopIds: [],
      allowedBranchCodes: [],
    };
    const prisma = {
      clientGroup: { findMany: jest.fn().mockResolvedValue([]) },
      clientTag: { findMany: jest.fn().mockResolvedValue([]) },
      shop: { findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };
    const service = new ClientsService(prisma as any, {} as any);

    await service.getFilters(contextWithoutShops);

    expect(prisma.shop.findMany).toHaveBeenCalledWith({
      where: { companyId: 'company-1', id: { in: [] } },
      orderBy: { name: 'asc' },
    });
    await expect(
      (service as any).resolveRegistrationShopId(
        'shop-foreign',
        contextWithoutShops,
      ),
    ).rejects.toThrow('registration_shop_id is not accessible');
  });
});
