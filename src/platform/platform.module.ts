import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PlatformController } from './platform.controller';
import { PlatformCronService } from './platform-cron.service';
import { PlatformService } from './platform.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [ScheduleModule.forRoot(), UsersModule],
  controllers: [PlatformController],
  providers: [PlatformService, PlatformCronService],
})
export class PlatformModule {}
