import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    CompanySettingsModule,
    ProductsModule,
    SalesModule,
    UsersModule,
  ],
})
export class AppModule {}
