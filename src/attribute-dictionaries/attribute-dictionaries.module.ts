import { Module } from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { UsersModule } from '../users/users.module';
import {
  AdminAttributeDictionariesController,
  AttributeDictionariesController,
} from './attribute-dictionaries.controller';
import { AttributeDictionariesService } from './attribute-dictionaries.service';

@Module({
  imports: [UsersModule],
  controllers: [
    AttributeDictionariesController,
    AdminAttributeDictionariesController,
  ],
  providers: [
    AttributeDictionariesService,
    JwtAuthGuard,
    CompanyAccessGuard,
    PermissionsGuard,
    PlatformAdminGuard,
  ],
  exports: [AttributeDictionariesService],
})
export class AttributeDictionariesModule {}
