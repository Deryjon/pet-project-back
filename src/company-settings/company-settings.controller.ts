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
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { CompanySettingsService } from './company-settings.service';

@Controller()
export class CompanySettingsController {
  constructor(
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  @Get(['default-currency', 'v1/default-currency'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getDefaultCurrency(
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getDefaultCurrency(context.companyId);
  }

  @Get(['country', 'v1/country'])
  async getCountries(@Query('limit') limit: string | undefined) {
    return this.companySettingsService.getCountries(Number(limit));
  }

  @Get(['time-zone', 'v1/time-zone'])
  async getTimeZones(
    @Query('limit') limit: string | undefined,
    @Query('country_id') countryId: string | undefined,
  ) {
    return this.companySettingsService.getTimeZones(Number(limit), countryId);
  }

  @Get('v2/company-tariff')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getCompanyTariff(
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getCompanyTariff(context.companyId);
  }

  @Get(['company', 'v1/company'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getCompany(@CurrentCompanyContext() context: CompanyRequestContext) {
    return this.companySettingsService.getCompany(context.companyId);
  }

  @Put(['company', 'v1/company'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('company-edit')
  async updateCompany(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.updateCompany(body, context.companyId);
  }

  @Get('shop')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getShops(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('name') name: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @Query('only_allowed') onlyAllowed: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getShops({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: context.companyId,
      allowedShopIds: context.allowedShopIds,
    });
  }

  @Get('v1/shop')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV1Shops(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('name') name: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @Query('only_allowed') onlyAllowed: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.getShops(limit, page, name, companyId, onlyAllowed, context);
  }

  @Get('v1/shop/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV1ShopById(
    @Param('id') id: string,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getShopById(id, context.companyId);
  }

  @Get('v2/measurement-unit/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getMeasurementUnit(
    @Param('id') id: string,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getMeasurementUnitById(
      id,
      context.companyId,
    );
  }

  @Get('v2/measurement-unit')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getMeasurementUnits(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('name') name: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getMeasurementUnits({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: context.companyId,
    });
  }

  @Get('v2/default-measurement-unit')
  async getDefaultMeasurementUnits() {
    return this.companySettingsService.getDefaultMeasurementUnits();
  }

  @Post('v2/measurement-unit')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('catalog-operations')
  async createMeasurementUnit(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.createMeasurementUnit({
      ...body,
      company_id: context.companyId,
    });
  }

  @Get(['price-tag', 'v1/price-tag'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTags(
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getPriceTags(context.companyId);
  }

  @Get(['price-tag/:id', 'v1/price-tag/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTagById(
    @Param('id') id: string,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getPriceTagById(id, context.companyId);
  }

  @Post(['price-tag', 'v1/price-tag'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async createPriceTag(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    const companyId = context.companyId;
    return this.companySettingsService.createPriceTag(body, companyId);
  }

  @Put(['price-tag/:id', 'v1/price-tag/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async updatePriceTag(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    const companyId = context.companyId;
    return this.companySettingsService.updatePriceTag(id, body, companyId);
  }

  @Delete(['price-tag/:id', 'v1/price-tag/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async deletePriceTag(
    @Param('id') id: string,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.deletePriceTag(id, context.companyId);
  }

  @Get(['company-payment-type', 'v1/company-payment-type'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV1CompanyPaymentTypes(
    @Query('limit') limit: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getCompanyPaymentTypes(
      Number(limit),
      context.companyId,
    );
  }

  @Post('company-payment-type')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('payment-type-create')
  async createCompanyPaymentType(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.createCompanyPaymentType(
      body,
      context.companyId,
    );
  }

  @Put('company-payment-type/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('payment-type-edit')
  async updateCompanyPaymentType(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.updateCompanyPaymentType(
      id,
      body,
      context.companyId,
    );
  }

  @Delete('company-payment-type/:id')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('payment-type-delete')
  async deleteCompanyPaymentType(
    @Param('id') id: string,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.deleteCompanyPaymentType(
      id,
      context.companyId,
    );
  }

  @Get('cash-box')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getCashBoxes(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('name') name: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getCashBoxes({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: context.companyId,
    });
  }

  @Get('v1/cash-box')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV1CashBoxes(
    @Query('limit') limit: string | undefined,
    @Query('page') page: string | undefined,
    @Query('name') name: string | undefined,
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getCashBoxes({
      limit: Number(limit),
      page: Number(page),
      name,
      companyId: context.companyId,
    });
  }

  @Get('v1/loyalty-program')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV1LoyaltyProgram(
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getLoyaltyProgram(context.companyId);
  }

  @Put('v1/loyalty-program')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('loyalty-edit')
  async updateLoyaltyProgram(
    @Body() body: Record<string, unknown>,
    @Headers('x-company-id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.updateLoyaltyProgram(
      body,
      context.companyId,
    );
  }

  @Get('v2/company-currencies')
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  async getV2CompanyCurrencies(
    @Query('company_id') companyId: string | undefined,
    @CurrentCompanyContext() context: CompanyRequestContext,
  ) {
    return this.companySettingsService.getCompanyCurrencies(context.companyId);
  }
}
