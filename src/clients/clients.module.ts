import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
  imports: [UsersModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
