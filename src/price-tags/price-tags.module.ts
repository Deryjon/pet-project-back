import { Module } from '@nestjs/common';
import { PriceTagsController } from './price-tags.controller';
import { PriceTagsService } from './price-tags.service';
import { PrismaModule } from '../prisma/prisma.module';
import { UsersModule } from '../users/users.module';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';

@Module({
  imports: [PrismaModule, UsersModule, CompanySettingsModule],
  controllers: [PriceTagsController],
  providers: [PriceTagsService, JwtAuthGuard, CompanyAccessGuard],
})
export class PriceTagsModule {}
