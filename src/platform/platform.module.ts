import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { PlatformController } from './platform.controller';
import { PlatformCronService } from './platform-cron.service';
import { PlatformService } from './platform.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformCronService, PlatformAdminGuard],
})
export class PlatformModule {}
