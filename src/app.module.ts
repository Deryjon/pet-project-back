import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CashboxesModule } from './modules/cashboxes/cashboxes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RolesModule } from './roles/roles.module';
import { SalesModule } from './sales/sales.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    PlatformModule,
    AuthModule,
    CompanySettingsModule,
    DashboardModule,
    CashboxesModule,
    PaymentsModule,
    OrdersModule,
    ProductsModule,
    RolesModule,
    SalesModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}

