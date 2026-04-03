import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';

@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('v1/dashboard-report')
  getDashboardReport(
    @Query('start_date') startDate?: string,
    @Query('detalization') detalization?: string,
    @Query('seller_field') sellerField?: string,
    @Query('currency') currency?: string,
    @Query('product_group_field') productGroupField?: string,
    @Query('product_field') productField?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.dashboardService.getDashboardReport(
      {
        startDate,
        detalization,
        sellerField,
        currency,
        productGroupField,
        productField,
      },
      authorization,
    );
  }

  @Post('v1/dashboard-setting')
  saveDashboardSetting(@Body() body: Record<string, unknown>) {
    return this.dashboardService.saveDashboardSetting(body);
  }
}
