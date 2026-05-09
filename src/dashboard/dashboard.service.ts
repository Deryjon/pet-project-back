import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class DashboardService {
  private dashboardSettingsStore = new Map<string, Record<string, unknown>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly companySettingsService: CompanySettingsService,
  ) {}

  async getDashboardReport(
    query: {
      startDate?: string;
      detalization?: string;
      sellerField?: string;
      currency?: string;
      productGroupField?: string;
      productField?: string;
    },
    authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    const startDate = this.parseStartDate(query.startDate);
    const detalization = (query.detalization ?? 'hour').trim().toLowerCase();
    const companyId = context?.companyId ?? undefined;
    const allowedBranchCodes = context?.allowedBranchCodes as string[] | undefined;
    const shops = await this.loadVisibleShops(companyId, allowedBranchCodes);
    const endDate = this.buildEndDate(startDate, detalization);

    const sales = await this.prisma.sale.findMany({
      where: {
        status: 'paid',
        ...(companyId
          ? {
              user: {
                companyId,
              },
            }
          : {}),
        ...(allowedBranchCodes?.length
          ? {
              branchCode: {
                in: allowedBranchCodes,
              },
            }
          : {}),
        paidAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      include: {
        user: true,
        items: true,
      },
      orderBy: {
        paidAt: 'asc',
      },
    });

    const shopByBranchCode = new Map(
      shops
        .filter((shop) => shop.branchCode)
        .map((shop) => [shop.branchCode, shop]),
    );
    const currencyCode =
      query.currency?.trim() ||
      this.companySettingsService.getDefaultCurrencyIsoCode(companyId);
    const bucketStarts = this.buildBuckets(startDate, detalization);
    const shopTotals = new Map<string, number>(
      shops.map((shop) => [shop.name, 0]),
    );
    const bucketTotals = bucketStarts.map((bucketStart) => ({
      start_date: this.formatDateTime(bucketStart),
      end_date: '',
      total_price: 0,
    }));
    const shopOrders = bucketStarts.map((bucketStart) => {
      const row: Record<string, number | string> = {
        start_date: this.formatDateTime(bucketStart),
      };

      for (const shop of shops) {
        row[shop.name] = 0;
      }

      return row;
    });

    const paymentTypeLookup = new Map<string, string>();
    const paymentTypes =
      this.companySettingsService.getCompanyPaymentTypes(undefined, companyId);
    for (const paymentType of paymentTypes.company_payment_types as Array<
      Record<string, unknown>
    >) {
      const paymentTypeId =
        typeof paymentType.id === 'string' ? paymentType.id : '';
      const paymentTypeName =
        typeof paymentType.name === 'string' ? paymentType.name : paymentTypeId;

      if (paymentTypeId) {
        paymentTypeLookup.set(paymentTypeId, paymentTypeName);
      }
    }

    const paymentTotals = new Map<
      string,
      { payment_type_id: string; payment_type_name: string; total_price: number; count: number }
    >();
    const sellerTotals = new Map<
      string,
      { seller_name: string; total_price: number; orders_count: number }
    >();
    const productTotals = new Map<
      string,
      { name: string; quantity: number; total_price: number; net_sales: number }
    >();

    for (const sale of sales) {
      const saleDate = sale.paidAt ?? sale.createdAt;
      const bucketIndex = this.resolveBucketIndex(bucketStarts, saleDate, detalization);
      const shop = sale.branchCode
        ? shopByBranchCode.get(sale.branchCode)
        : undefined;
      const shopName = shop?.name ?? sale.branchCode ?? 'Unknown';
      const saleTotal = this.getSignedSaleAmount(sale);

      if (bucketIndex >= 0) {
        bucketTotals[bucketIndex].total_price += saleTotal;
        if (shopOrders[bucketIndex][shopName] === undefined) {
          shopOrders[bucketIndex][shopName] = 0;
        }
        shopOrders[bucketIndex][shopName] =
          Number(shopOrders[bucketIndex][shopName] ?? 0) + saleTotal;
      }

      shopTotals.set(shopName, (shopTotals.get(shopName) ?? 0) + saleTotal);

      if (sale.paymentMethod) {
        const paymentTypeName =
          paymentTypeLookup.get(sale.paymentMethod) ?? sale.paymentMethod;
        const existingPayment = paymentTotals.get(sale.paymentMethod) ?? {
          payment_type_id: sale.paymentMethod,
          payment_type_name: paymentTypeName,
          total_price: 0,
          count: 0,
        };

        existingPayment.total_price += saleTotal;
        existingPayment.count += 1;
        paymentTotals.set(sale.paymentMethod, existingPayment);
      }

      const sellerName = sale.user
        ? `${sale.user.firstName} ${sale.user.lastName}`.trim()
        : 'Unknown';
      const existingSeller = sellerTotals.get(sellerName) ?? {
        seller_name: sellerName,
        total_price: 0,
        orders_count: 0,
      };
      existingSeller.total_price += saleTotal;
      existingSeller.orders_count += 1;
      sellerTotals.set(sellerName, existingSeller);

      for (const item of sale.items) {
        const productName = item.name || `Product ${item.productId ?? ''}`.trim();
        const existingProduct = productTotals.get(productName) ?? {
          name: productName,
          quantity: 0,
          total_price: 0,
          net_sales: 0,
        };
        existingProduct.quantity += item.quantity;
        existingProduct.total_price += item.lineTotal;
        existingProduct.net_sales += item.lineTotal;
        productTotals.set(productName, existingProduct);
      }
    }

    const visibleShopNames = new Set([
      ...shops.map((shop) => shop.name),
      ...shopTotals.keys(),
    ]);

    for (const row of shopOrders) {
      for (const shopName of visibleShopNames) {
        if (row[shopName] === undefined) {
          row[shopName] = 0;
        }
      }
    }

      return {
        shops: [...visibleShopNames].map((shopName) => ({
          shop_name: shopName,
          total_price: shopTotals.get(shopName) ?? 0,
        })),
      shop_orders: shopOrders,
      total: bucketTotals,
      total_orders_price: sales.reduce(
        (sum, sale) => sum + this.getSignedSaleAmount(sale),
        0,
      ),
      payment_type_stats: [...paymentTotals.values()],
      transactions: {
        total: sales.length,
        products: sales.reduce(
          (sum, sale) => sum + sale.items.filter((item) => item.productId).length,
          0,
        ),
        services: 0,
        sets: 0,
        refunds: sales.filter((sale) => (sale as any).saleType === 'return').length,
        exchanges: sales.filter((sale) => (sale as any).saleType === 'exchange').length,
      },
      top_sellers: [...sellerTotals.values()]
        .sort((a, b) => b.total_price - a.total_price)
        .slice(0, 10),
      top_products: [...productTotals.values()]
        .sort((a, b) => b.net_sales - a.net_sales)
        .slice(0, 10),
      client_report: {
        returned_clients_count: 0,
        new_clients_count: 0,
      },
      shop_targets: [],
      currency: currencyCode,
      seller_field: query.sellerField ?? 'sales_sum',
      product_group_field: query.productGroupField ?? 'name',
      product_field: query.productField ?? 'net_sales',
    };
  }

  saveDashboardSetting(body: Record<string, unknown>) {
    const id = randomUUID();
    this.dashboardSettingsStore.set(id, { ...body });

    return {
      message: id,
    };
  }

  private async loadVisibleShops(
    companyId?: string,
    allowedBranchCodes?: string[],
  ) {
    const shopsResponse = await this.companySettingsService.getShops({
      companyId,
      limit: 1000,
      page: 1,
    });
    const shops = shopsResponse.shops as Array<Record<string, unknown>>;

    return shops
      .map((shop) => ({
        id: typeof shop.id === 'string' ? shop.id : '',
        name: typeof shop.name === 'string' ? shop.name : '',
        branchCode:
          typeof shop.branch_code === 'string'
            ? shop.branch_code
            : typeof shop.branchCode === 'string'
              ? shop.branchCode
              : '',
      }))
      .filter(
        (shop) =>
          !!shop.name &&
          (!allowedBranchCodes?.length ||
            allowedBranchCodes.includes(shop.branchCode)),
      );
  }

  private parseStartDate(value?: string) {
    const normalized = value?.trim();
    if (!normalized) {
      const now = new Date();
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    }

    const date = new Date(`${normalized}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('start_date must be in YYYY-MM-DD format');
    }

    return date;
  }

  private buildEndDate(startDate: Date, detalization: string) {
    const endDate = new Date(startDate);

    if (detalization === 'day') {
      endDate.setDate(endDate.getDate() + 30);
      return endDate;
    }

    endDate.setDate(endDate.getDate() + 1);
    return endDate;
  }

  private buildBuckets(startDate: Date, detalization: string) {
    const buckets: Date[] = [];

    if (detalization === 'day') {
      for (let index = 0; index < 30; index += 1) {
        const bucket = new Date(startDate);
        bucket.setDate(startDate.getDate() + index);
        buckets.push(bucket);
      }

      return buckets;
    }

    for (let hour = 0; hour < 24; hour += 1) {
      const bucket = new Date(startDate);
      bucket.setHours(hour, 0, 0, 0);
      buckets.push(bucket);
    }

    return buckets;
  }

  private resolveBucketIndex(
    bucketStarts: Date[],
    value: Date,
    detalization: string,
  ) {
    if (detalization === 'day') {
      return bucketStarts.findIndex(
        (bucketStart) =>
          bucketStart.getFullYear() === value.getFullYear() &&
          bucketStart.getMonth() === value.getMonth() &&
          bucketStart.getDate() === value.getDate(),
      );
    }

    return bucketStarts.findIndex(
      (bucketStart) =>
        bucketStart.getFullYear() === value.getFullYear() &&
        bucketStart.getMonth() === value.getMonth() &&
        bucketStart.getDate() === value.getDate() &&
        bucketStart.getHours() === value.getHours(),
    );
  }

  private formatDateTime(value: Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    const seconds = String(value.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  private getSignedSaleAmount(sale: {
    payableTotal?: number | null;
    total?: number | null;
    saleType?: string;
  }) {
    const amount = sale.payableTotal ?? sale.total ?? 0;
    return sale.saleType === 'return' ? -amount : amount;
  }
}
