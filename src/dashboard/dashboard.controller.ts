import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DashboardService } from './dashboard.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('v1/dashboard-report')
  getDashboardReport(
    @Query('start_date') startDate?: string,
    @Query('end_date') endDate?: string,
    @Query('detalization') detalization?: string,
    @Query('seller_field') sellerField?: string,
    @Query('currency') currency?: string,
    @Query('product_group_field') productGroupField?: string,
    @Query('product_field') productField?: string,
    @Query('branch_code') branchCode?: string,
    @Headers('authorization') authorization?: string,
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
      authorization,
    );
  }

  @Post('v1/dashboard-setting')
  saveDashboardSetting(@Body() body: Record<string, unknown>) {
    return this.dashboardService.saveDashboardSetting(body);
  }
}
