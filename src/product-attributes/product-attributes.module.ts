import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { UsersModule } from '../users/users.module';
import { ProductAttributesController } from './product-attributes.controller';
import { ProductAttributesService } from './product-attributes.service';

@Module({
  imports: [UsersModule],
  controllers: [ProductAttributesController],
  providers: [
    ProductAttributesService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [ProductAttributesService],
})
export class ProductAttributesModule {}
