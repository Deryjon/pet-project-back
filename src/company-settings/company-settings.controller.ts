import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { UsersService } from '../users/users.service';

@Controller()
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
    private readonly usersService: UsersService,
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
  async getShops(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('name') name?: string,
    @Query('company_id') companyId?: string,
    @Query('only_allowed') onlyAllowed?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const shouldUseAllowed = onlyAllowed === 'true';
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.getShops({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: companyId || context?.companyId || undefined,
      allowedShopIds: shouldUseAllowed
        ? (context?.allowedShopIds ?? [])
        : undefined,
    });
  }

  @Get('v2/measurement-unit/:id')
  async getMeasurementUnit(
    @Param('id') id: string,
    @Query('company_id') companyId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.getMeasurementUnitById(
      id,
      companyId || context?.companyId || undefined,
    );
  }

  @Get('price-tag')
  @Get('v1/price-tag')
  async getPriceTags(
    @Query('company_id') companyId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.getPriceTags(
      companyId || context?.companyId || undefined,
    );
  }

  @Post('price-tag')
  @Post('v1/price-tag')
  createPriceTag(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createPriceTag(body);
  }

  @Put('price-tag/:id')
  @Put('v1/price-tag/:id')
  updatePriceTag(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updatePriceTag(id, body);
  }

  @Delete('price-tag/:id')
  @Delete('v1/price-tag/:id')
  deletePriceTag(@Param('id') id: string) {
    return this.companySettingsService.deletePriceTag(id);
  }

  @Post('cheque')
  createCheque(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCheque(body);
  }

  @Post('v1/cheque')
  createV1Cheque(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCheque(body);
  }

  @Put('cheque/:id')
  updateCheque(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.companySettingsService.updateCheque(id, body);
  }

  @Put('v1/cheque/:id')
  updateV1Cheque(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updateCheque(id, body);
  }

  @Delete('cheque/:id')
  deleteCheque(@Param('id') id: string) {
    return this.companySettingsService.deleteCheque(id);
  }

  @Delete('v1/cheque/:id')
  deleteV1Cheque(@Param('id') id: string) {
    return this.companySettingsService.deleteCheque(id);
  }

  @Get('cheque/:id')
  getChequeById(@Param('id') id: string) {
    return this.companySettingsService.getChequeById(id);
  }

  @Get('v1/cheque/:id')
  getV1ChequeById(@Param('id') id: string) {
    return this.companySettingsService.getChequeById(id);
  }

  @Get('cheque')
  getCheque(
    @Query('name') name?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.companySettingsService.getCheque({
      name,
      limit: Number(limit),
      page: Number(page),
    });
  }

  @Get('v1/cheque')
  getV1Cheque(
    @Query('name') name?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
  ) {
    return this.companySettingsService.getCheque({
      name,
      limit: Number(limit),
      page: Number(page),
    });
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

  @Post('company-payment-type')
  createCompanyPaymentType(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCompanyPaymentType(body);
  }

  @Put('company-payment-type/:id')
  updateCompanyPaymentType(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updateCompanyPaymentType(id, body);
  }

  @Delete('company-payment-type/:id')
  deleteCompanyPaymentType(@Param('id') id: string) {
    return this.companySettingsService.deleteCompanyPaymentType(id);
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
