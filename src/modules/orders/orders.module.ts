import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { UsersModule } from '../../users/users.module';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [UsersModule],
  controllers: [OrdersController],
  providers: [
    OrdersService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [OrdersService],
})
export class OrdersModule {}
