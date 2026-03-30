import { Controller, Get, Query } from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';

@Controller()
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get('default-currency')
  @Get('v1/default-currency')
  getDefaultCurrency(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getDefaultCurrency(companyId);
  }

  @Get('country')
  @Get('v1/country')
  getCountries(@Query('limit') limit?: string) {
    return this.companySettingsService.getCountries(Number(limit));
  }

  @Get('time-zone')
  @Get('v1/time-zone')
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
  @Get('v1/company')
  getCompany() {
    return this.companySettingsService.getCompany();
  }

  @Get('shop')
  @Get('v1/shop')
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

  @Get('cheque')
  @Get('v1/cheque')
  getCheque(@Query('limit') limit?: string) {
    return this.companySettingsService.getCheque(Number(limit));
  }

  @Get('company-payment-type')
  @Get('v1/company-payment-type')
  getCompanyPaymentTypes(
    @Query('limit') limit?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.companySettingsService.getCompanyPaymentTypes(
      Number(limit),
      companyId,
    );
  }

  @Get('cash-box')
  @Get('v1/cash-box')
  getCashBoxes(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('name') name?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.companySettingsService.getCashBoxes({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId,
    });
  }
}
