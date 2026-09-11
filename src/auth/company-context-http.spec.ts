import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { companyContext } from '../../test/fixtures/request-context';
import { ClientsController } from '../clients/clients.controller';
import { ClientsService } from '../clients/clients.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { DashboardController } from '../dashboard/dashboard.controller';
import { DashboardService } from '../dashboard/dashboard.service';
import { SupplierInvoicesController } from '../imports/controllers/supplier-invoices.controller';
import { SuppliersController } from '../imports/controllers/suppliers.controller';
import { SupplierDirectoryService } from '../imports/services/supplier-directory.service';
import { SupplierInvoiceService } from '../imports/services/supplier-invoice.service';
import { CashboxesController } from '../modules/cashboxes/cashboxes.controller';
import { CashboxesService } from '../modules/cashboxes/cashboxes.service';
import { OrdersController } from '../modules/orders/orders.controller';
import { OrdersService } from '../modules/orders/orders.service';
import { PaymentTypesController } from '../modules/payments/payment-types.controller';
import { PaymentTypesService } from '../modules/payments/payment-types.service';
import { PriceTagsController } from '../price-tags/price-tags.controller';
import { PriceTagsService } from '../price-tags/price-tags.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { ReceiptsController } from '../receipts/receipts.controller';
import { ReceiptsService } from '../receipts/receipts.service';
import { ReportsController } from '../reports/reports.controller';
import { ReportsService } from '../reports/reports.service';
import { SalesController } from '../sales/sales.controller';
import { SalesService } from '../sales/sales.service';
import { TelegramController } from '../telegram/telegram.controller';
import { TelegramService } from '../telegram/telegram.service';
import { UsersService } from '../users/users.service';
import { WarehouseController } from '../warehouse/warehouse.controller';
import { WarehouseService } from '../warehouse/warehouse.service';
import request = require('supertest');

const routes = [
  ['/sales', SalesService, 'findAll'],
  ['/products', ProductsService, 'findAll'],
  ['/clients', ClientsService, 'findAll'],
  ['/v1/inventory-sessions', WarehouseService, 'listInventorySessions'],
  ['/v1/dashboard-report', DashboardService, 'getDashboardReport'],
  ['/orders/order-1', OrdersService, 'findOne'],
  ['/cashboxes', CashboxesService, 'findAll'],
  ['/payment-types', PaymentTypesService, 'findAll'],
  ['/suppliers', SupplierDirectoryService, 'list'],
  ['/supplier-invoices', SupplierInvoiceService, 'list'],
  ['/telegram/subscribers', TelegramService, 'getSubscribers'],
  ['/receipts/by-number/123', ReceiptsService, 'getByNumber'],
  ['/price-tags?productIds=1', PriceTagsService, 'getPriceTagsData'],
  ['/reports/summary', ReportsService, 'getSummary'],
] as const;

describe('company context across HTTP boundaries', () => {
  let app: INestApplication;
  const actor = companyContext({ allowedShopIds: [], allowedBranchCodes: [] });
  const getRequestContext = jest.fn();
  const stubs = new Map<any, Record<string, jest.Mock>>();

  beforeAll(async () => {
    for (const [, service, method] of routes)
      stubs.set(service, {
        [method]: jest.fn().mockResolvedValue({ ok: true }),
      });
    stubs.get(ReportsService)!.updateSellerSalarySettings = jest
      .fn()
      .mockResolvedValue({ ok: true });
    const module = await Test.createTestingModule({
      controllers: [
        SalesController,
        ProductsController,
        ClientsController,
        WarehouseController,
        DashboardController,
        OrdersController,
        CashboxesController,
        PaymentTypesController,
        SuppliersController,
        SupplierInvoicesController,
        TelegramController,
        ReceiptsController,
        PriceTagsController,
        ReportsController,
      ],
      providers: [
        ...[...stubs].map(([provide, useValue]) => ({ provide, useValue })),
        { provide: CompanySettingsService, useValue: {} },
        { provide: UsersService, useValue: { getRequestContext } },
        {
          provide: PrismaService,
          useValue: {
            role: { findFirst: jest.fn().mockResolvedValue({ isAdmin: true }) },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => {
    jest.clearAllMocks();
    getRequestContext.mockImplementation(async (auth: string) => {
      if (auth === 'Bearer company') return actor;
      if (auth === 'Bearer other')
        return companyContext({ companyId: 'company-2', userId: 8 });
      if (auth === 'Bearer platform')
        return {
          ...actor,
          userType: 'platform',
          companyId: null,
          role: 'platform_admin',
        };
      throw new UnauthorizedException();
    });
  });

  it.each(routes)(
    'authenticates once and passes the checked scope for %s',
    async (url, service, method) => {
      await request(app.getHttpServer())
        .get(url)
        .query({ company_id: 'foreign' })
        .set('Authorization', 'Bearer company')
        .set('x-company-id', 'foreign')
        .expect(200);
      expect(getRequestContext).toHaveBeenCalledTimes(1);
      const call = stubs.get(service)![method].mock.calls[0];
      if (service === ReceiptsService || service === PriceTagsService) {
        expect(call).toContain(actor.companyId);
      } else {
        expect(call).toContainEqual(actor);
      }
    },
  );

  it.each(routes)(
    'rejects anonymous and platform reads before the service for %s',
    async (url, service, method) => {
      await request(app.getHttpServer()).get(url).expect(401);
      await request(app.getHttpServer())
        .get(url)
        .set('Authorization', 'Bearer platform')
        .expect(403);
      expect(stubs.get(service)![method]).not.toHaveBeenCalled();
    },
  );

  it('keeps concurrent requests from different companies isolated', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', 'Bearer company')
        .expect(200),
      request(app.getHttpServer())
        .get('/clients')
        .set('Authorization', 'Bearer other')
        .expect(200),
    ]);
    expect(responses).toHaveLength(2);
    expect(getRequestContext).toHaveBeenCalledTimes(2);
    const contexts = stubs
      .get(ClientsService)!
      .findAll.mock.calls.map((call) => call[1]);
    expect(contexts).toEqual(
      expect.arrayContaining([
        actor,
        companyContext({ companyId: 'company-2', userId: 8 }),
      ]),
    );
  });

  it('preserves the platform salary route and forwards its checked actor', async () => {
    await request(app.getHttpServer())
      .put('/sellers/99/salary-settings')
      .set('Authorization', 'Bearer platform')
      .send({ fixedSalary: 500, companyId: 'foreign' })
      .expect(200);
    expect(getRequestContext).toHaveBeenCalledTimes(1);
    expect(
      stubs.get(ReportsService)!.updateSellerSalarySettings,
    ).toHaveBeenCalledWith(
      '99',
      expect.anything(),
      expect.objectContaining({
        userType: 'platform',
        companyId: null,
        role: 'platform_admin',
      }),
    );
  });
});
