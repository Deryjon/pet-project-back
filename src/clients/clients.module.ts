import { Module } from '@nestjs/common';
import { CompanySettingsModule } from '../company-settings/company-settings.module';
import { UsersModule } from '../users/users.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [UsersModule, CompanySettingsModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
