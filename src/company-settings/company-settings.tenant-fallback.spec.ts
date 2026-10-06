import { BadRequestException } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';

// A request that lost its company context must fail instead of silently
// reading or writing another company's settings (the old fallbacks used the
// oldest active company or a hard-coded "default" company).
describe('CompanySettingsService without a company', () => {
  const db = {
    company: { findFirst: jest.fn(), findUnique: jest.fn() },
    priceTagSetting: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    shop: { findMany: jest.fn(), count: jest.fn() },
  };
  const service = new CompanySettingsService(db as never);

  afterEach(() => jest.clearAllMocks());

  it.each([
    ['getPriceTags', () => service.getPriceTags(undefined)],
    ['getShops', () => service.getShops({})],
    ['getShopById', () => service.getShopById('shop-1', undefined)],
    ['getCompanyPaymentTypes', () => service.getCompanyPaymentTypes()],
    ['createPriceTag', () => service.createPriceTag({ name: 'Tag' })],
    ['updateCompany', () => service.updateCompany({ name: 'X' })],
    ['updatePriceTag', () => service.updatePriceTag('tag-1', { name: 'X' })],
    ['deletePriceTag', () => service.deletePriceTag('tag-1')],
  ])(
    '%s refuses instead of falling back to another company',
    async (_, call) => {
      await expect(call()).rejects.toBeInstanceOf(BadRequestException);
      expect(db.company.findFirst).not.toHaveBeenCalled();
      expect(db.priceTagSetting.findMany).not.toHaveBeenCalled();
      expect(db.shop.findMany).not.toHaveBeenCalled();
    },
  );

  it("never touches another company's price tag", async () => {
    db.priceTagSetting.findUnique.mockResolvedValue({
      id: 'tag-1',
      companyId: 'other-company',
    });
    await expect(
      service.updatePriceTag('tag-1', { company_id: 'c-1' }, 'c-1'),
    ).rejects.toThrow('Price tag not found');
    await expect(service.deletePriceTag('tag-1', 'c-1')).rejects.toThrow(
      'Price tag not found',
    );
    expect(db.priceTagSetting.update).not.toHaveBeenCalled();
    expect(db.priceTagSetting.delete).not.toHaveBeenCalled();
  });

  it('falls back to global defaults, not a cached tenant, without a company', () => {
    expect(service.getDefaultCurrencyIsoCode()).toBe('UZS');
  });
});
