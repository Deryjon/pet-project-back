import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [CompanySettingsModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
