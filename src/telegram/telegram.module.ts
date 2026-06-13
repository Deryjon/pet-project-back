import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { TelegramController } from './telegram.controller';
import { TelegramService } from './telegram.service';
import { TelegramReportService } from './telegram-report.service';

@Module({
  imports: [UsersModule],
  controllers: [TelegramController],
  providers: [TelegramService, TelegramReportService],
  exports: [TelegramService],
})
export class TelegramModule {}
