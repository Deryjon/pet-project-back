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
            variants: [],
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
            variants: [],
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

  it('prints one tag per colour/size with the variant barcode and stock', async () => {
    const prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 1,
            publicId: 'product-1',
            name: 'Футболка',
            brand: { name: 'Zara' },
            sku: 'TSH',
            barcode: '2000000000001',
            salePrice: 150,
            discountPrice: null,
            stocks: [{ shopId: 'shop-1', branchCode: 'main', salePrice: 150, quantity: 8 }],
            variants: [
              {
                id: 'v-m',
                sku: 'TSH-01',
                barcode: '2000000000018',
                salePrice: 150,
                color: { name: 'Чёрный' },
                size: { name: 'M' },
                stocks: [{ shopId: 'shop-1', branchCode: 'main', salePrice: 150, quantity: 5 }],
              },
              {
                id: 'v-l',
                sku: 'TSH-02',
                barcode: '2000000000025',
                salePrice: 160,
                color: { name: 'Чёрный' },
                size: { name: 'L' },
                stocks: [{ shopId: 'shop-1', branchCode: 'main', salePrice: 0, quantity: 3 }],
              },
            ],
          },
        ]),
      },
      shop: {
        findFirst: jest.fn().mockResolvedValue({ id: 'shop-1', branchCode: 'main', name: 'Main shop' }),
      },
    };
    const service = new PriceTagsService(prisma as any);

    const result = await service.getPriceTagsData('1', '1:2', 'company-1', 'shop-1');

    expect(result.products).toEqual([
      expect.objectContaining({
        tag_key: '1:v-m',
        name: 'Футболка Чёрный / M',
        base_name: 'Футболка',
        brand: 'Zara',
        size: 'M',
        color: 'Чёрный',
        variant_id: 'v-m',
        barcode: '2000000000018',
        sku: 'TSH-01',
        price: 150,
        quantity: 5,
        copies: 2,
      }),
      expect.objectContaining({
        tag_key: '1:v-l',
        name: 'Футболка Чёрный / L',
        barcode: '2000000000025',
        price: 160,
        quantity: 3,
      }),
    ]);
  });
});
