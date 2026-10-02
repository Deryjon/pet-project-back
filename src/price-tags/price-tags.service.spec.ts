import { PriceTagsService } from './price-tags.service';

describe('PriceTagsService', () => {
  it('resolves a shop by id and uses its stock price', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            publicId: 'product-1',
            name: 'Product',
            salePrice: 100,
            discountPrice: null,
            stocks: [
              {
                shopId: 'shop-1',
                branchCode: 'main',
                salePrice: 125,
                quantity: 4,
              },
            ],
          },
        ]),
      },
      shop: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shop-1',
          branchCode: 'main',
          name: 'Main shop',
        }),
      },
    };
    const service = new PriceTagsService(prisma as any);

    const result = await service.getPriceTagsData(
      'product-1',
      undefined,
      'company-1',
      'shop-1',
    );

    expect(prisma.shop.findFirst).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        OR: [{ id: 'shop-1' }, { branchCode: 'shop-1' }],
      },
    });
    expect(result.products[0]).toMatchObject({
      price: 125,
      quantity: 4,
      shop_name: 'Main shop',
    });
  });

  it('falls back to the product price when the shop stock price is zero', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            publicId: 'product-1',
            name: 'Product',
            salePrice: 100,
            discountPrice: null,
            stocks: [
              {
                shopId: 'shop-1',
                branchCode: 'main',
                salePrice: 0,
                quantity: 2,
              },
            ],
          },
        ]),
      },
      shop: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'shop-1',
          branchCode: 'main',
          name: 'Main shop',
        }),
      },
    };
    const service = new PriceTagsService(prisma as any);

    const result = await service.getPriceTagsData(
      'product-1',
      undefined,
      'company-1',
      'shop-1',
    );

    expect(result.products[0].price).toBe(100);
  });
});
