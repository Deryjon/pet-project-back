import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
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
import { PriceTagsModule } from './price-tags/price-tags.module';
import { ProductAttributesModule } from './product-attributes/product-attributes.module';
import { ProductsModule } from './products/products.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { RolesModule } from './roles/roles.module';
import { ReportsModule } from './reports/reports.module';
import { SalesModule } from './sales/sales.module';
import { TelegramModule } from './telegram/telegram.module';
import { UsersModule } from './users/users.module';
import { WarehouseModule } from './warehouse/warehouse.module';
import { HealthController } from './health.controller';
import { ImportsModule } from './imports/imports.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    // Applied to every route by the global guard below; login routes tighten
    // it with @Throttle. A second named throttler would apply to all routes
    // too, so the stricter login limit is an override, not its own throttler.
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: 60000,
        limit: 100,
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
    PriceTagsModule,
    ProductsModule,
    ProductAttributesModule,
    ReceiptsModule,
    RolesModule,
    ReportsModule,
    SalesModule,
    TelegramModule,
    UsersModule,
    WarehouseModule,
    ImportsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
