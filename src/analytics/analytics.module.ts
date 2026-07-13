import { Module } from '@nestjs/common';
import { SellerAnalyticsService } from './seller-analytics.service';

@Module({
  providers: [SellerAnalyticsService],
  exports: [SellerAnalyticsService],
})
export class AnalyticsModule {}
