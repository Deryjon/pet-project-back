import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CompanySettingsModule } from './company-settings/company-settings.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { CashboxesModule } from './modules/cashboxes/cashboxes.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { PlatformModule } from './platform/platform.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { RolesModule } from './roles/roles.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
      },
      {
        name: 'auth',
        ttl: 60000,
        limit: 5,
      },
    ]),
    PrismaModule,
    PlatformModule,
    AuthModule,
    ClientsModule,
    CompanySettingsModule,
    DashboardModule,
    CashboxesModule,
    PaymentsModule,
    OrdersModule,
    ProductsModule,
    RolesModule,
    ReportsModule,
    SalesModule,
    TelegramModule,
    UsersModule,
  ],
  controllers: [HealthController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}

