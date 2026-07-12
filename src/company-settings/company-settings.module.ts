import { Module } from '@nestjs/common';
import { CompanySettingsController } from './company-settings.controller';
import { CompanySettingsService } from './company-settings.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [CompanySettingsController],
  providers: [
    CompanySettingsService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
  ],
  exports: [CompanySettingsService],
})
export class CompanySettingsModule {}
