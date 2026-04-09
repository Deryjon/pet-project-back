import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { UsersModule } from '../users/users.module';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [CompanySettingsModule, UsersModule],
  controllers: [SalesController],
  providers: [SalesService],
})
export class SalesModule {}
