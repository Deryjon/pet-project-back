import { Controller, Get, Query } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';

@Controller()
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get('default-currency')
  getDefaultCurrency(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getDefaultCurrency(companyId);
  }

  @Get('country')
  getCountries(@Query('limit') limit?: string) {
    return this.companySettingsService.getCountries(Number(limit));
  }

  @Get('time-zone')
  getTimeZones(
    @Query('limit') limit?: string,
    @Query('country_id') countryId?: string,
  ) {
    return this.companySettingsService.getTimeZones(Number(limit), countryId);
  }

  @Get('v2/company-tariff')
  getCompanyTariff() {
    return this.companySettingsService.getCompanyTariff();
  }

  @Get('company')
  getCompany() {
    return this.companySettingsService.getCompany();
  }

  @Get('shop')
  getShops(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('name') name?: string,
    @Query('company_id') companyId?: string,
    @Query('only_allowed') _onlyAllowed?: string,
  ) {
    return this.companySettingsService.getShops({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId,
    });
  }
}
