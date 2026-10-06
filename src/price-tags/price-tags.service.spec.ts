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

  describe('variant tags', () => {
    const product = {
      id: 7,
      publicId: 'p-7',
      name: 'Куртка',
      sku: 'JKT',
      article: 'ART-77',
      barcode: null,
      salePrice: 500,
      discountPrice: null,
      brand: null,
      stocks: [{ shopId: 'shop-1', branchCode: 'a', salePrice: 480, quantity: 9 }],
      variants: [
        {
          id: 'v-1',
          sku: 'JKT-BLK-M',
          barcode: '111',
          salePrice: 520,
          color: { name: 'Чёрный' },
          size: { name: 'M' },
          attributeValues: [],
          stocks: [
            { shopId: 'shop-1', branchCode: 'a', salePrice: 530, quantity: 2 },
            { shopId: 'shop-2', branchCode: 'b', salePrice: 540, quantity: 3 },
            { shopId: 'shop-3', branchCode: 'c', salePrice: 550, quantity: 10 },
          ],
        },
      ],
    };
    const makeService = (shop: unknown = null) =>
      new PriceTagsService({
        product: { findMany: jest.fn().mockResolvedValue([product]) },
        shop: { findFirst: jest.fn().mockResolvedValue(shop) },
      } as any);

    it('prints the model article, not the variant SKU, on every tag', async () => {
      const result = await makeService().getPriceTagsData('7', undefined, 'c-1');
      expect(result.products[0]).toEqual(
        expect.objectContaining({ article: 'ART-77', sku: 'JKT-BLK-M' }),
      );
    });

    it('uses the variant default price and summed allowed stock for all shops', async () => {
      const result = await makeService().getPriceTagsData('7', undefined, 'c-1', undefined, [
        'shop-1',
        'shop-2',
      ]);
      expect(result.products[0]).toEqual(
        expect.objectContaining({ price: 520, quantity: 5 }),
      );
    });

    it('refuses a shop outside the allowed shops', async () => {
      await expect(
        makeService({ id: 'shop-3', branchCode: 'c', name: 'C' }).getPriceTagsData(
          '7',
          undefined,
          'c-1',
          'shop-3',
          ['shop-1', 'shop-2'],
        ),
      ).rejects.toThrow('Нет доступа');
    });

    it('falls back to the variant price, then the product price', async () => {
      const variant = product.variants[0];
      const noStockPrice = {
        ...product,
        variants: [
          { ...variant, stocks: variant.stocks.map((s) => ({ ...s, salePrice: null })) },
          { ...variant, id: 'v-2', salePrice: null, stocks: [] },
        ],
      };
      const service = new PriceTagsService({
        product: { findMany: jest.fn().mockResolvedValue([noStockPrice]) },
        shop: { findFirst: jest.fn().mockResolvedValue({ id: 'shop-1', branchCode: 'a', name: 'A' }) },
      } as any);
      const result = await service.getPriceTagsData('7', undefined, 'c-1', 'shop-1');
      expect(result.products.map((row: any) => row.price)).toEqual([520, 480]);
    });

    it("uses the shop's variant price and stock for one shop", async () => {
      const result = await makeService({ id: 'shop-2', branchCode: 'b', name: 'B' }).getPriceTagsData(
        '7',
        undefined,
        'c-1',
        'shop-2',
      );
      expect(result.products[0]).toEqual(
        expect.objectContaining({ price: 540, quantity: 3 }),
      );
    });
  });
});
