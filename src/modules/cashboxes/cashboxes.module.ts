import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { UsersModule } from '../../users/users.module';
import { CashboxesController } from './cashboxes.controller';
import { CashboxesService } from './cashboxes.service';

@Module({
  imports: [UsersModule],
  controllers: [CashboxesController],
  providers: [
    CashboxesService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [CashboxesService],
})
export class CashboxesModule {}
