import { ProductsService } from './products.service';

describe('ProductsService identifier generation', () => {
  const buildService = () => {
    const prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
    };

    const service = new ProductsService(
      prisma as any,
      {} as any,
      { getRequestContext: jest.fn() } as any,
    );

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

    await expect(service.generateSku({ company_id: 'company-1' })).resolves.toEqual(
      {
        sku: 'SKU-00011',
      },
    );
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
      service.generateBarcode({ company_id: 'company-1' }),
    ).resolves.toEqual({
      barcode: '2000000000015',
    });
  });

  it('ignores existing invalid EAN13 barcodes when choosing the next barcode', async () => {
    const { prisma, service } = buildService();
    prisma.product.findMany.mockResolvedValue([{ barcode: '2000000000000' }]);
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.generateBarcode({ company_id: 'company-1' }),
    ).resolves.toEqual({
      barcode: '2000000000008',
    });
  });
});


describe('Legacy product creation authorization', () => {
  it('rejects calls without authorization before writing a product', async () => {
    const prisma = { product: { create: jest.fn() } };
    const service = new ProductsService(prisma as any, {} as any, {} as any);
    await expect(service.create({ name: 'Cable', company_id: 'foreign' })).rejects.toThrow('Authorization is required');
    expect(prisma.product.create).not.toHaveBeenCalled();
  });
  it('uses the authenticated company even when the request supplies another ID', async () => {
    const prisma = { product: { create: jest.fn().mockResolvedValue({ id: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 1 }) } };
    const service = new ProductsService(prisma as any, {} as any, { getRequestContext: jest.fn().mockResolvedValue({ userType: 'company', companyId: 'own', allowedShopIds: [], allowedBranchCodes: [] }) } as any);
    jest.spyOn(service as any, 'toProductResponse').mockImplementation(value => value);
    await service.create({ name: 'Cable', company_id: 'foreign' }, 'Bearer user');
    expect(prisma.product.create).toHaveBeenCalledWith({ data: expect.objectContaining({ company: { connect: { id: 'own' } } }) });
  });
});
