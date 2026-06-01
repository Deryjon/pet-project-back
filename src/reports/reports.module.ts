import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { UsersModule } from '../users/users.module';
import { CustomerReportsService } from './customer-reports.service';
import { ProductReportsService } from './product-reports.service';
import { ReportsController } from './reports.controller';
import { ReportsMapper } from './reports.mapper';
import { ReportsRepository } from './reports.repository';
import { ReportsService } from './reports.service';
import { SalaryService } from './salary.service';
import { SellerReportsService } from './seller-reports.service';

@Module({
  imports: [UsersModule, CompanySettingsModule],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportsRepository,
    ReportsMapper,
    SalaryService,
    SellerReportsService,
    ProductReportsService,
    CustomerReportsService,
  ],
})
export class ReportsModule {}
