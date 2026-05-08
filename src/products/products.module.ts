import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { UsersModule } from '../users/users.module';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [CompanySettingsModule, UsersModule],
  controllers: [ProductsController],
  providers: [
    ProductsService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [ProductsService],
})
export class ProductsModule {}
