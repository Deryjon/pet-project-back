import { Module } from '@nestjs/common';
import { AnalyticsModule } from '../analytics/analytics.module';
import { PlatformModule } from '../platform/platform.module';
import { UsersModule } from '../users/users.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramReportService } from './telegram-report.service';
import { TelegramSellerAnalyticsService } from './telegram-seller-analytics.service';

@Module({
  imports: [UsersModule, AnalyticsModule, PlatformModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramReportService, TelegramSellerAnalyticsService],
  exports: [TelegramService],
})
export class TelegramModule {}
