import {
  Body,
  Controller,
  Get,
  HttpCode,
  Logger,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CompanyRequestContext,
  requireCompanyContext,
} from '../auth/request-context';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PriceTagsService } from './price-tags.service';

const PRINT_STAGES = new Set(['data', 'render', 'print']);

@Controller()
export class PriceTagsController {
  private readonly logger = new Logger('PriceTagPrint');

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
    const context = await requireCompanyContext(requestContext);
    if (!productIds) {
      return { products: [] };
    }
    return this.priceTagsService.getPriceTagsData(
      productIds,
      copies,
      context.companyId,
      branchId,
      context.allowedShopIds,
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

  /**
   * A print stage that took over 3 s on a client (data / render / print),
   * written to the server log to find the real bottleneck on slow devices.
   */
  @Post(['price-tags/print-metrics', 'v1/price-tags/print-metrics'])
  @HttpCode(204)
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  logPrintMetrics(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    const context = requireCompanyContext(requestContext);
    const stage = typeof body?.stage === 'string' ? body.stage : '';
    const duration = Math.round(Number(body?.duration_ms));
    if (!PRINT_STAGES.has(stage) || !Number.isFinite(duration)) return;
    const count = (value: unknown) =>
      Number.isFinite(Number(value)) ? Number(value) : undefined;
    this.logger.warn(
      JSON.stringify({
        company_id: context.companyId,
        user_id: context.userId,
        shop_id: context.currentShopId,
        stage,
        duration_ms: duration,
        labels: count(body.labels),
        products: count(body.products),
        chunk: count(body.chunk),
        user_agent:
          typeof body.user_agent === 'string'
            ? body.user_agent.slice(0, 200)
            : undefined,
      }),
    );
  }
}
