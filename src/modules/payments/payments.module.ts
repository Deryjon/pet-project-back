import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { UsersModule } from '../../users/users.module';
import { PaymentTypesController } from './payment-types.controller';
import { PaymentTypesService } from './payment-types.service';

@Module({
  imports: [UsersModule],
  controllers: [PaymentTypesController],
  providers: [
    PaymentTypesService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [PaymentTypesService],
})
export class PaymentsModule {}
