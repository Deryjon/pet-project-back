import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { TelegramController } from '../telegram/telegram.controller';
import { TelegramService } from '../telegram/telegram.service';
import { CompanyAccessGuard } from './guards/company-access.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';
import { PERMISSIONS_KEY } from './permissions.decorator';
import { CompanyRequestContext } from './request-context';

describe('stage 12 company boundary', () => {
  const context: CompanyRequestContext = {
    userId: 7,
    fullName: 'Manager',
    userType: 'company',
    role: 'role-1',
    crmRoleId: 'role-1',
    crmRoleName: 'Manager',
    companyId: 'company-1',
    currentShopId: 'shop-1',
    currentBranchCode: 'B1',
    allowedShopIds: ['shop-1'],
    allowedBranchCodes: ['B1'],
    canSwitchShops: false,
  };

  it('protects every ProductsController route with company guards', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, CompanyAccessGuard]),
    );
  });

  it('keeps ReportsController authenticated while services enforce company scope', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual(
      expect.arrayContaining([JwtAuthGuard]),
    );
  });

  it('keeps an empty product branch scope empty', () => {
    const service = new ProductsService({} as any, {} as any);
    const scoped = (service as any).applyProductScope(
      { archivedAt: null },
      {
        ...context,
        currentShopId: null,
        currentBranchCode: null,
        allowedShopIds: [],
        allowedBranchCodes: [],
      },
    );

    expect(scoped).toEqual({
      AND: [
        { archivedAt: null },
        { companyId: 'company-1' },
        { id: { in: [] } },
      ],
    });
  });

  it('keeps empty transfer and movement scopes empty', async () => {
    const service = new ProductsService({} as any, {} as any);
    const emptyContext = {
      ...context,
      currentShopId: null,
      currentBranchCode: null,
      allowedShopIds: [],
      allowedBranchCodes: [],
    };

    expect((service as any).buildTransferScope(emptyContext)).toEqual({
      companyId: 'company-1',
      id: { in: [] },
    });
    await expect(
      (service as any).buildProductMovementWhere(undefined, {}, emptyContext),
    ).resolves.toEqual({
      AND: [{ companyId: 'company-1' }, { shopId: { in: [] } }],
    });
  });

  it('does not resolve a write branch through another company', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new ProductsService(
      { shop: { findFirst } } as any,
      {} as any,
    );

    await expect(
      (service as any).resolveBranchCodeForWrite('foreign-shop', context),
    ).rejects.toThrow('does not have access');
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ companyId: 'company-1' }),
      }),
    );
  });

  it('forwards the checked context to legacy import and stocktaking reads', async () => {
    const products = {
      getImportProgress: jest.fn(),
      getImportItemsDp: jest.fn(),
      getImportSearch: jest.fn(),
      cancelImport: jest.fn(),
      getStocktakingById: jest.fn(),
      getStocktakingLogs: jest.fn(),
    };
    const controller = new ProductsController(products as any);

    await controller.getImportProgress('import-1', context);
    await controller.getImportItemsDp('import-1', context);
    await controller.getImportSearch('import-1', '20', '1', 'false', context);
    await controller.cancelImportDraft('import-1', context);
    await controller.getStocktakingById(
      'stocktaking-1',
      '1',
      '10',
      undefined,
      context,
    );
    await controller.getStocktakingLogs('stocktaking-1', '1', '10', context);

    for (const method of Object.values(products)) {
      expect(method).toHaveBeenCalled();
      expect(method.mock.calls[0]).toContain(context);
    }
  });

  it('hides a foreign import session before returning its items', async () => {
    const service = new ProductsService({} as any, {} as any);
    jest
      .spyOn(service as any, 'resolveImportSessionFromStore')
      .mockResolvedValue({ companyId: 'company-foreign', shopId: 'shop-2' });
    const ensurePreview = jest.spyOn(
      service as any,
      'ensureImportPreviewItems',
    );

    await expect(
      service.getImportItemsDp('foreign-import', context),
    ).rejects.toThrow('Import session not found');
    expect(ensurePreview).not.toHaveBeenCalled();
  });

  it('passes the mandatory context into report queries', async () => {
    const getCompanyRequestContext = jest.fn().mockResolvedValue(context);
    const getSaleItemFacts = jest.fn().mockResolvedValue([]);
    const service = new ReportsService(
      {} as any,
      {} as any,
      { getCompanyRequestContext } as any,
      { getSaleItemFacts } as any,
      {
        toFilterDto: jest.fn().mockReturnValue({}),
        toDailySeries: jest.fn().mockReturnValue([]),
      } as any,
      {} as any,
      {} as any,
    );

    await service.getSummary({}, context);

    expect(getCompanyRequestContext).not.toHaveBeenCalled();
    expect(getSaleItemFacts).toHaveBeenCalledWith({}, context);
  });

  it('filters report shop lookups by the allowed branches', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new ReportsService(
      { shop: { findMany } } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );
    const emptyContext = { ...context, allowedBranchCodes: [] };

    await (service as any).loadReportShops(emptyContext, {});

    expect(findMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        branchCode: { in: [] },
      },
      orderBy: { name: 'asc' },
    });
  });

  it('does not expose a report shop outside the branch scope', async () => {
    const findFirst = jest.fn().mockResolvedValue(null);
    const service = new ReportsService(
      { shop: { findFirst } } as any,
      {} as any,
      {
        getCompanyRequestContext: jest.fn().mockResolvedValue(context),
      } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
    );

    await expect(
      service.getShopDetail('shop-foreign', {}, context),
    ).rejects.toThrow('Shop not found');
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        branchCode: { in: ['B1'] },
        OR: [{ id: 'shop-foreign' }, { branchCode: 'shop-foreign' }],
      },
    });
  });

  it.each([
    'generateLink',
    'getSubscribers',
    'updateSubscriber',
    'deleteSubscriber',
  ])('protects TelegramController.%s with its permission', (method) => {
    const handler = TelegramController.prototype[method];
    expect(Reflect.getMetadata(GUARDS_METADATA, handler)).toEqual(
      expect.arrayContaining([
        JwtAuthGuard,
        CompanyAccessGuard,
        PermissionsGuard,
      ]),
    );
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handler)).toEqual([
      'telegram-notification',
    ]);
  });

  it('rejects a Telegram subscriber branch outside the user scope', async () => {
    const findFirst = jest.fn();
    const service = new TelegramService(
      { telegramSubscriber: { findFirst } } as any,
      {} as any,
    );

    await expect(
      service.updateSubscriber('subscriber-1', { branchCode: 'B2' }, context),
    ).rejects.toThrow('Филиал недоступен');
    expect(findFirst).not.toHaveBeenCalled();
  });
});
