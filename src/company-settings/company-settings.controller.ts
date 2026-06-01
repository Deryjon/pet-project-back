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
  async getDefaultCurrency(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getDefaultCurrency(companyId);
  }

  @Get('country')
  @Get('v1/country')
  async getCountries(@Query('limit') limit?: string) {
    return this.companySettingsService.getCountries(Number(limit));
  }

  @Get('time-zone')
  @Get('v1/time-zone')
  async getTimeZones(
    @Query('limit') limit?: string,
    @Query('country_id') countryId?: string,
  ) {
    return this.companySettingsService.getTimeZones(Number(limit), countryId);
  }

  @Get('v2/company-tariff')
  async getCompanyTariff() {
    return this.companySettingsService.getCompanyTariff();
  }

  @Get('company')
  @Get('v1/company')
  async getCompany() {
    return this.companySettingsService.getCompany();
  }

  @Put('company')
  @Put('v1/company')
  async updateCompany(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.updateCompany(
      body,
      context?.companyId || undefined,
    );
  }

  @Get('shop')
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

  @Get('v1/shop')
  async getV1Shops(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('name') name?: string,
    @Query('company_id') companyId?: string,
    @Query('only_allowed') onlyAllowed?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.getShops(
      limit,
      page,
      name,
      companyId,
      onlyAllowed,
      authorization,
    );
  }

  @Get('v1/shop/:id')
  async getV1ShopById(
    @Param('id') id: string,
    @Query('company_id') companyId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.getShopById(
      id,
      companyId || context?.companyId || undefined,
    );
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

  @Get('v2/measurement-unit')
  async getMeasurementUnits(
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Query('name') name?: string,
    @Query('company_id') companyId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.getMeasurementUnits({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: companyId || context?.companyId || undefined,
    });
  }

  @Get('v2/default-measurement-unit')
  async getDefaultMeasurementUnits() {
    return this.companySettingsService.getDefaultMeasurementUnits();
  }

  @Post('v2/measurement-unit')
  async createMeasurementUnit(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;

    return this.companySettingsService.createMeasurementUnit({
      ...body,
      company_id:
        (typeof body.company_id === 'string' ? body.company_id : undefined) ||
        context?.companyId,
    });
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
  async createPriceTag(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createPriceTag(body);
  }

  @Put('price-tag/:id')
  @Put('v1/price-tag/:id')
  async updatePriceTag(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updatePriceTag(id, body);
  }

  @Delete('price-tag/:id')
  @Delete('v1/price-tag/:id')
  async deletePriceTag(@Param('id') id: string) {
    return this.companySettingsService.deletePriceTag(id);
  }

  @Post('cheque')
  async createCheque(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCheque(body);
  }

  @Post('v1/cheque')
  async createV1Cheque(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCheque(body);
  }

  @Put('cheque/:id')
  async updateCheque(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.companySettingsService.updateCheque(id, body);
  }

  @Put('v1/cheque/:id')
  async updateV1Cheque(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updateCheque(id, body);
  }

  @Delete('cheque/:id')
  async deleteCheque(@Param('id') id: string) {
    return this.companySettingsService.deleteCheque(id);
  }

  @Delete('v1/cheque/:id')
  async deleteV1Cheque(@Param('id') id: string) {
    return this.companySettingsService.deleteCheque(id);
  }

  @Get('cheque/:id')
  async getChequeById(@Param('id') id: string) {
    return this.companySettingsService.getChequeById(id);
  }

  @Get('v1/cheque/:id')
  async getV1ChequeById(@Param('id') id: string) {
    return this.companySettingsService.getChequeById(id);
  }

  @Get('cheque')
  async getCheque(
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
  async getV1Cheque(
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
  async getV1CompanyPaymentTypes(
    @Query('limit') limit?: string,
    @Query('company_id') companyId?: string,
  ) {
    return this.companySettingsService.getCompanyPaymentTypes(
      Number(limit),
      companyId,
    );
  }

  @Post('company-payment-type')
  async createCompanyPaymentType(@Body() body: Record<string, unknown>) {
    return this.companySettingsService.createCompanyPaymentType(body);
  }

  @Put('company-payment-type/:id')
  async updateCompanyPaymentType(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.companySettingsService.updateCompanyPaymentType(id, body);
  }

  @Delete('company-payment-type/:id')
  async deleteCompanyPaymentType(@Param('id') id: string) {
    return this.companySettingsService.deleteCompanyPaymentType(id);
  }

  @Get('cash-box')
  async getCashBoxes(
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

  @Get('v1/cash-box')
  async getV1CashBoxes(
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

  @Get('v1/loyalty-program')
  async getV1LoyaltyProgram(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getLoyaltyProgram(companyId);
  }

  @Get('v2/company-currencies')
  async getV2CompanyCurrencies(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getCompanyCurrencies(companyId);
  }
}
