import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('dashboard-orders')
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('v1/dashboard-report')
  getDashboardReport(
    @Query('start_date') startDate: string | undefined,
    @Query('end_date') endDate: string | undefined,
    @Query('detalization') detalization: string | undefined,
    @Query('seller_field') sellerField: string | undefined,
    @Query('currency') currency: string | undefined,
    @Query('product_group_field') productGroupField: string | undefined,
    @Query('product_field') productField: string | undefined,
    @Query('branch_code') branchCode: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dashboardService.getDashboardReport(
      {
        startDate,
        endDate,
        detalization,
        sellerField,
        currency,
        productGroupField,
        productField,
        branchCode: branchCode?.trim() || undefined,
      },
      requestContext,
    );
  }

  @Post('v1/dashboard-setting')
  saveDashboardSetting(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.dashboardService.saveDashboardSetting(body, requestContext);
  }
}
