import {
  BadRequestException,
  Controller,
  Get,
  Headers,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { PriceTagsService } from './price-tags.service';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';

@Controller()
export class PriceTagsController {
  constructor(
    private readonly priceTagsService: PriceTagsService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly usersService: UsersService,
  ) {}

  private async requireCompanyId(authorization?: string) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    if (!context?.companyId) {
      throw new BadRequestException('Company context is required');
    }
    return context.companyId;
  }

  @Get(['price-tags', 'v1/price-tags'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTagsData(
    @Query('productIds') productIds: string,
    @Query('copies') copies: string | undefined,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    if (!productIds) {
      return { products: [] };
    }
    return this.priceTagsService.getPriceTagsData(productIds, copies, companyId);
  }

  // branchId is accepted per the print-flow contract (per-branch print stations)
  // but templates are currently company-wide, matching PriceTagSetting's schema.
  @Get(['price-tag-templates/:branchId', 'v1/price-tag-templates/:branchId'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTagTemplates(
    @Param('branchId') _branchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.companySettingsService.getPriceTags(companyId);
  }
}
