import { Module } from '@nestjs/common';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [ReceiptsController],
  providers: [
    ReceiptsService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
