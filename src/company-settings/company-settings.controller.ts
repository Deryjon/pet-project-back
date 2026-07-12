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
  UseGuards,
} from '@nestjs/common';
import { CompanySettingsService } from './company-settings.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';

@Controller()
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
    private readonly usersService: UsersService,
  ) {}

  @Get(['default-currency', 'v1/default-currency'])
  async getDefaultCurrency(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getDefaultCurrency(companyId);
  }

  @Get(['country', 'v1/country'])
  async getCountries(@Query('limit') limit?: string) {
    return this.companySettingsService.getCountries(Number(limit));
  }

  @Get(['time-zone', 'v1/time-zone'])
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

  @Get(['company', 'v1/company'])
  async getCompany() {
    return this.companySettingsService.getCompany();
  }

  @Put(['company', 'v1/company'])
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

  @Get(['price-tag', 'v1/price-tag'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
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

  @Post(['price-tag', 'v1/price-tag'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async createPriceTag(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    const companyId = context?.companyId ?? (body.company_id as string | undefined);
    return this.companySettingsService.createPriceTag(body, companyId);
  }

  @Put(['price-tag/:id', 'v1/price-tag/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async updatePriceTag(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    const companyId = context?.companyId ?? (body.company_id as string | undefined);
    return this.companySettingsService.updatePriceTag(id, body, companyId);
  }

  @Delete(['price-tag/:id', 'v1/price-tag/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async deletePriceTag(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    return this.companySettingsService.deletePriceTag(id, context?.companyId ?? undefined);
  }

  @Post(['cheque', 'v1/cheque'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async createCheque(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    const companyId = context?.companyId ?? (body.company_id as string | undefined);
    return this.companySettingsService.createCheque(body, companyId);
  }

  @Put(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async updateCheque(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    return this.companySettingsService.updateCheque(
      id,
      body,
      context?.companyId ?? undefined,
    );
  }

  @Delete(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async deleteCheque(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    return this.companySettingsService.deleteCheque(
      id,
      context?.companyId ?? undefined,
    );
  }

  @Get(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getChequeById(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    return this.companySettingsService.getChequeById(
      id,
      context?.companyId ?? undefined,
    );
  }

  @Get(['cheque', 'v1/cheque'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getCheque(
    @Query('name') name?: string,
    @Query('limit') limit?: string,
    @Query('page') page?: string,
    @Headers('authorization') authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    return this.companySettingsService.getCheque({
      name,
      limit: Number(limit),
      page: Number(page),
      companyId: context?.companyId ?? undefined,
    });
  }

  @Get(['company-payment-type', 'v1/company-payment-type'])
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

  @Put('v1/loyalty-program')
  updateLoyaltyProgram(
    @Body() body: Record<string, unknown>,
    @Headers('x-company-id') companyId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.companySettingsService.updateLoyaltyProgram(body, companyId);
  }

  @Get('v2/company-currencies')
  async getV2CompanyCurrencies(@Query('company_id') companyId?: string) {
    return this.companySettingsService.getCompanyCurrencies(companyId);
  }
}
