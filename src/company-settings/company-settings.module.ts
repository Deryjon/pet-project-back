import { Module } from '@nestjs/common';
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsService } from './company-settings.service';

@Module({
  controllers: [CompanySettingsController],
  providers: [CompanySettingsService],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
