import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';

const granularityLabels: Record<string, string> = {
  hour: 'по часам',
  day: 'по дням',
  week: 'по неделям',
  month: 'по месяцам',
};

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
      reportPeriod?: string;
      branchCode?: string;
    },
    authorization?: string,
  ) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    const startDate = this.parseStartDate(query.startDate);
    const reportPeriod = (query.reportPeriod ?? '').trim().toLowerCase();
    const detalization = (query.detalization ?? 'hour').trim().toLowerCase();
    const companyId = context?.companyId ?? undefined;
    const allowedBranchCodes = context?.allowedBranchCodes as string[] | undefined;
    const filterBranchCode = query.branchCode || undefined;
    const allShops = await this.loadVisibleShops(companyId, allowedBranchCodes);
    const shops = filterBranchCode
      ? allShops.filter((s) => s.branchCode === filterBranchCode)
      : allShops;
    const endDate = this.buildEndDate(startDate, detalization);

    const effectiveBranchCodes = filterBranchCode
      ? [filterBranchCode]
      : allowedBranchCodes?.length
        ? allowedBranchCodes
        : undefined;

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
        ...(effectiveBranchCodes?.length
          ? {
              branchCode: {
                in: effectiveBranchCodes,
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
    const bucketStarts = this.buildBuckets(startDate, detalization, endDate);
    const shopTotals = new Map<string, number>(
      shops.map((shop) => [shop.name, 0]),
    );
    const bucketTotals = bucketStarts.map((bucketStart, index) => {
      const nextBucketStart = bucketStarts[index + 1];
      let bucketEndDate = new Date(bucketStart);

      // Calculate end_date for each bucket based on detalization
      switch (detalization) {
        case 'month': bucketEndDate.setMonth(bucketEndDate.getMonth() + 1); bucketEndDate.setDate(bucketEndDate.getDate() - 1); break;
        case 'week': bucketEndDate.setDate(bucketEndDate.getDate() + 6); break;
        case 'day': bucketEndDate.setDate(bucketEndDate.getDate()); break;
        case 'hour': default: bucketEndDate.setHours(bucketEndDate.getHours()); break;
      }
      const actualEndDate = nextBucketStart ? new Date(nextBucketStart.getTime() - 1) : bucketEndDate;

      return {
        start_date: this.formatDateTime(bucketStart, companyId),
        end_date: this.formatDateTime(actualEndDate, companyId),
        total_price: 0,
      };
    });
    const shopOrders = bucketStarts.map((bucketStart) => {
      const row: Record<string, number | string> = {
        start_date: this.formatDateTime(bucketStart, companyId),
      };

      for (const shop of shops) {
        row[shop.name] = 0;
      }

      return row;
    });

    const paymentTypeLookup = new Map<string, string>();
    const paymentTypes = await this.companySettingsService.getCompanyPaymentTypes(
      undefined,
      companyId,
    );
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
      granularity_label: granularityLabels[detalization] || granularityLabels.hour,
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

  private buildEndDate(startDate: Date, detalization: string, reportPeriod?: string) {
    const endDate = new Date(startDate);

    // If reportPeriod is specified, it takes precedence for the overall duration
    if (reportPeriod === 'year') {
      endDate.setFullYear(startDate.getFullYear() + 1);
      return endDate;
    }
    if (reportPeriod === 'month') {
      endDate.setMonth(startDate.getMonth() + 1);
      return endDate;
    }
    if (reportPeriod === 'week') {
      endDate.setDate(startDate.getDate() + 7);
      return endDate;
    }

    // Default durations based on detalization if no reportPeriod
    switch (detalization) {
      case 'month':
        endDate.setFullYear(startDate.getFullYear() + 1); // Default to a year for monthly view
        break;
      case 'week':
        endDate.setMonth(startDate.getMonth() + 3); // Default to 3 months for weekly view
        break;
      case 'day':
        endDate.setDate(startDate.getDate() + 30); // Default to 30 days
        break;
      case 'hour':
      default:
        endDate.setDate(startDate.getDate() + 1); // Default to 1 day for hourly view
        break;
    }
    return endDate;
  }

  private buildBuckets(startDate: Date, detalization: string, endDate: Date) {
    const buckets: Date[] = [];
    let current = new Date(startDate);

    while (current < endDate) {
      buckets.push(new Date(current)); // Push the start of the current bucket

      switch (detalization) {
        case 'month':
          current.setMonth(current.getMonth() + 1);
          break;
        case 'week':
          current.setDate(current.getDate() + 7);
          break;
        case 'day':
          current.setDate(current.getDate() + 1);
          break;
        case 'hour':
        default:
          current.setHours(current.getHours() + 1);
          break;
      }
      // Reset minutes, seconds, milliseconds to ensure clean bucket boundaries
      current.setMinutes(0, 0, 0);
    }

    return buckets;
  }

  private resolveBucketIndex(
    bucketStarts: Date[],
    value: Date,
    detalization: string,
  ) {
    // For hour and day, direct comparison of components is fine
    if (detalization === 'hour') {
      return bucketStarts.findIndex(
        (bucketStart) =>
          bucketStart.getFullYear() === value.getFullYear() &&
          bucketStart.getMonth() === value.getMonth() &&
          bucketStart.getDate() === value.getDate() &&
          bucketStart.getHours() === value.getHours(),
      );
    }

    if (detalization === 'day') {
      return bucketStarts.findIndex(
        (bucketStart) =>
          bucketStart.getFullYear() === value.getFullYear() &&
          bucketStart.getMonth() === value.getMonth() &&
          bucketStart.getDate() === value.getDate(),
      );
    }
    
    // For week and month, we need to check if the value falls within the bucket's range
    // A bucket starts at `bucketStarts[i]` and ends just before `bucketStarts[i+1]`
    for (let i = 0; i < bucketStarts.length; i++) {
      const bucketStart = bucketStarts[i];
      const nextBucketStart = bucketStarts[i + 1];

      if (value >= bucketStart && (!nextBucketStart || value < nextBucketStart)) {
        return i;
      }
    }

    return -1; // Not found
  }

  private formatDateTime(value: Date, companyId?: string) {
    return this.companySettingsService.formatDateTimeForCompany(value, companyId);
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
