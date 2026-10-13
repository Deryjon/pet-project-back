import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { TelegramModule } from '../telegram/telegram.module';
import { UsersModule } from '../users/users.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [UsersModule, CompanySettingsModule, TelegramModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
