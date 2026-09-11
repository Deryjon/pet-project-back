import { CompanyRequestContext } from '../auth/request-context';
import { ProductsService } from './products.service';

const companyContext: CompanyRequestContext = {
  userId: 1,
  fullName: 'Catalog user',
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

describe('ProductsService identifier generation', () => {
  const buildService = () => {
    const prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const service = new ProductsService(prisma as any, {} as any);

    return { prisma, service };
  };

  it('generates the next company-scoped sku sequentially', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([
      { sku: 'SKU-00010' },
      { sku: 'SKU-00002' },
      { sku: 'SKU-BAD' },
    ]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateSku({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      sku: 'SKU-00011',
    });
    expect(prisma.product.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        sku: 'SKU-00011',
      },
      select: { id: true },
    });
  });

  it('generates a valid EAN13 barcode with check digit', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([{ barcode: '2000000000008' }]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateBarcode({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      barcode: '2000000000015',
    });
  });

  it('ignores existing invalid EAN13 barcodes when choosing the next barcode', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([{ barcode: '2000000000000' }]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateBarcode({ company_id: 'foreign' }, companyContext),
    ).resolves.toEqual({
      barcode: '2000000000008',
    });
  });
});
describe('Legacy product creation authorization', () => {
  it('rejects calls without authorization before writing a product', async () => {
    const prisma = { product: { create: jest.fn() } };
    const service = new ProductsService(prisma as any, {} as any);
    await expect(
      service.create(
        { name: 'Cable', company_id: 'foreign' },
        undefined as any,
      ),
    ).rejects.toThrow('Only company users');
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('uses the authenticated company even when the request supplies another ID', async () => {
    const prisma = {
      product: {
        create: jest.fn().mockResolvedValue({ id: 1 }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1 }),
      },
    };
    const service = new ProductsService(prisma as any, {} as any);
    jest
      .spyOn(service as any, 'toProductResponse')
      .mockImplementation((value) => value);
    await service.create(
      { name: 'Cable', company_id: 'foreign' },
      { ...companyContext, companyId: 'own' },
    );
    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ company: { connect: { id: 'own' } } }),
    });
  });
});
