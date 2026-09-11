import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PriceTagsService } from './price-tags.service';

@Controller()
export class PriceTagsController {
  constructor(
    private readonly priceTagsService: PriceTagsService,
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  private async requireCompanyId(requestContext: CompanyRequestContext) {
    const context = await requireCompanyContext(requestContext);
    return context.companyId;
  }

  @Get(['price-tags', 'v1/price-tags'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTagsData(
    @Query('productIds') productIds: string,
    @Query('copies') copies: string | undefined,
    @Query('branchId') branchId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    const companyId = await this.requireCompanyId(requestContext);
    if (!productIds) {
      return { products: [] };
    }
    return this.priceTagsService.getPriceTagsData(
      productIds,
      copies,
      companyId,
      branchId,
    );
  }

  // branchId is accepted per the print-flow contract (per-branch print stations)
  // but templates are currently company-wide, matching PriceTagSetting's schema.
  @Get(['price-tag-templates/:branchId', 'v1/price-tag-templates/:branchId'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getPriceTagTemplates(
    @Param('branchId') _branchId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    const companyId = await this.requireCompanyId(requestContext);
    return this.companySettingsService.getPriceTags(companyId);
  }
}
