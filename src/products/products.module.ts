import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [CompanySettingsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
