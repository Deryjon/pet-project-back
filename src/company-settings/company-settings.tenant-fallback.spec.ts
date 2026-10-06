import { BadRequestException } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';

// A request that lost its company context must fail instead of silently
// reading or writing another company's settings (the old fallbacks used the
// oldest active company or a hard-coded "default" company).
describe('CompanySettingsService without a company', () => {
  const db = {
    company: { findFirst: jest.fn(), findUnique: jest.fn() },
    priceTagSetting: { findMany: jest.fn(), count: jest.fn() },
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
  ])(
    '%s refuses instead of falling back to another company',
    async (_, call) => {
      await expect(call()).rejects.toBeInstanceOf(BadRequestException);
      expect(db.company.findFirst).not.toHaveBeenCalled();
      expect(db.priceTagSetting.findMany).not.toHaveBeenCalled();
      expect(db.shop.findMany).not.toHaveBeenCalled();
    },
  );
});
