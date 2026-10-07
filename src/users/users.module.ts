import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { buildAccessTokenJwtOptions } from '../auth/jwt-options';
import { ConfigService } from '@nestjs/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: buildAccessTokenJwtOptions,
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
