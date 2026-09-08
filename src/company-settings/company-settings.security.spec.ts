import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsService } from './company-settings.service';
import { ProductsController } from '../products/products.controller';
import { ProductsService } from '../products/products.service';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

const writeRoutes = [
  ['post', '/company-payment-type'],
  ['put', '/company-payment-type/foreign'],
  ['delete', '/company-payment-type/foreign'],
  ['put', '/company'],
  ['put', '/v1/company'],
  ['put', '/v1/loyalty-program'],
  ['post', '/products'],
  ['post', '/v2/product/create'],
  ['post', '/v2/measurement-unit'],
] as const;

describe('Company API authorization boundary', () => {
  let app: INestApplication;
  let db: any;
  let settings: CompanySettingsService;
  let products: any;

  beforeAll(async () => {
    db = {
      role: {
        findFirst: jest.fn(async ({ where }) => ({
          isAdmin: where.id === 'admin',
        })),
      },
      rolePermission: { findMany: jest.fn(async () => []) },
      companyPaymentType: {
        count: jest.fn(async () => 1),
        upsert: jest.fn(async () => ({})),
        findMany: jest.fn(async ({ where }) => [
          { id: 'own', companyId: where.companyId, name: 'Cash' },
        ]),
        findFirst: jest.fn(async ({ where }) =>
          where.id === 'own' && where.companyId === 'company-a'
            ? { id: 'own', companyId: 'company-a' }
            : null,
        ),
        create: jest.fn(async ({ data }) => ({ id: 'created', ...data })),
        update: jest.fn(async ({ data }) => ({
          id: 'own',
          companyId: 'company-a',
          ...data,
        })),
        delete: jest.fn(async () => ({ id: 'own', companyId: 'company-a' })),
      },
    };
    settings = new CompanySettingsService(db);
    jest
      .spyOn(settings, 'getCompany')
      .mockImplementation(async (companyId) => ({ id: companyId }));
    jest
      .spyOn(settings, 'updateCompany')
      .mockImplementation(async (_body, companyId) => ({
        id: companyId!,
        name: 'Company A',
        subdomen: 'a',
        is_active: true,
      }));
    jest.spyOn(settings, 'updateLoyaltyProgram').mockResolvedValue({} as any);
    products = {
      create: jest.fn(async () => ({})),
      createCatalogProduct: jest.fn(async () => ({})),
    };
    const module = await Test.createTestingModule({
      controllers: [CompanySettingsController, ProductsController],
      providers: [
        { provide: CompanySettingsService, useValue: settings },
        { provide: ProductsService, useValue: products },
        { provide: PrismaService, useValue: db },
        {
          provide: UsersService,
          useValue: {
            getRequestContext: async (auth: string) => {
              if (
                !['Bearer admin', 'Bearer reader', 'Bearer platform'].includes(
                  auth,
                )
              )
                throw new UnauthorizedException();
              return {
                userType: auth === 'Bearer platform' ? 'platform' : 'company',
                companyId: 'company-a',
                crmRoleId: auth === 'Bearer admin' ? 'admin' : 'reader',
                allowedShopIds: ['shop-a'],
              };
            },
          },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
  });
  beforeEach(() => jest.clearAllMocks());

  it.each(writeRoutes)(
    'rejects anonymous %s %s before writes',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .send({ name: 'test' })
        .expect(401);
      expect(db.companyPaymentType.create).not.toHaveBeenCalled();
      expect(db.companyPaymentType.update).not.toHaveBeenCalled();
      expect(db.companyPaymentType.delete).not.toHaveBeenCalled();
      expect(products.create).not.toHaveBeenCalled();
    },
  );
  it.each(writeRoutes)(
    'rejects a user without the operation permission: %s %s',
    async (method, path) => {
      await request(app.getHttpServer())
        [method](path)
        .set('Authorization', 'Bearer reader')
        .send({ name: 'test' })
        .expect(403);
    },
  );
  it('rejects platform credentials on company writes', async () => {
    await request(app.getHttpServer())
      .post('/company-payment-type')
      .set('Authorization', 'Bearer platform')
      .send({ name: 'test' })
      .expect(403);
  });
  it('uses the session company for payment reads despite spoofed query', async () => {
    const response = await request(app.getHttpServer())
      .get('/company-payment-type?company_id=foreign')
      .set('Authorization', 'Bearer reader')
      .expect(200);
    expect(response.body.company_payment_types[0].company_id).toBe('company-a');
  });
  it('creates a payment type only in the session company', async () => {
    await request(app.getHttpServer())
      .post('/company-payment-type')
      .set('Authorization', 'Bearer admin')
      .send({ name: 'Card', company_id: 'foreign' })
      .expect(201);
    expect(db.companyPaymentType.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ companyId: 'company-a' }),
    });
  });
  it.each(['put', 'delete'] as const)(
    'rejects %s of another company payment type',
    async (method) => {
      await request(app.getHttpServer())
        [method]('/company-payment-type/foreign')
        .set('Authorization', 'Bearer admin')
        .send({ name: 'Changed' })
        .expect(404);
      expect(db.companyPaymentType.update).not.toHaveBeenCalled();
      expect(db.companyPaymentType.delete).not.toHaveBeenCalled();
    },
  );
  it('does not move an existing payment type to another company', async () => {
    await request(app.getHttpServer())
      .put('/company-payment-type/own')
      .set('Authorization', 'Bearer admin')
      .send({ name: 'Changed', company_id: 'foreign' })
      .expect(200);
    expect(db.companyPaymentType.update).toHaveBeenCalledWith({
      where: { id: 'own', companyId: 'company-a' },
      data: { name: 'Changed' },
    });
  });
  it('uses the session company for company profile and loyalty updates', async () => {
    await request(app.getHttpServer())
      .get('/company')
      .set('Authorization', 'Bearer admin')
      .expect(200, { id: 'company-a' });
    await request(app.getHttpServer())
      .put('/company')
      .set('Authorization', 'Bearer admin')
      .send({ company_id: 'foreign' })
      .expect(200);
    expect(settings.updateCompany).toHaveBeenCalledWith(
      { company_id: 'foreign' },
      'company-a',
    );
    await request(app.getHttpServer())
      .put('/v1/loyalty-program')
      .set('Authorization', 'Bearer admin')
      .set('x-company-id', 'foreign')
      .send({ is_active: true })
      .expect(200);
    expect(settings.updateLoyaltyProgram).toHaveBeenCalledWith(
      { is_active: true },
      'company-a',
    );
  });
});
