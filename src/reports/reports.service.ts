import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CompanySettingsService } from '../company-settings/company-settings.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ReportsMapper } from './reports.mapper';
import { ReportsRepository } from './reports.repository';
import { SalaryService } from './salary.service';
import { SellerReportsService } from './seller-reports.service';

const MAX_REPORT_RECORDS = 10_000;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySettingsService: CompanySettingsService,
    private readonly usersService: UsersService,
    private readonly reportsRepository: ReportsRepository,
    private readonly reportsMapper: ReportsMapper,
    private readonly salaryService: SalaryService,
    private readonly sellerReportsService: SellerReportsService,
  ) {}

  private get db(): PrismaService {
    return this.prisma;
  }

  async getSummary(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const filter = this.reportsMapper.toFilterDto(query);
    const rows = await this.reportsRepository.getSaleItemFacts(filter, context);
    const summary = this.buildSummaryMetricsFromFacts(rows);

    return {
      summary,
      chart: this.reportsMapper.toDailySeries(
        rows.map((row: any) => ({
          paid_at: row.paid_at,
          created_at: row.created_at,
          value:
            row.sale_type === 'return'
              ? -Number(row.final_price ?? 0)
              : Number(row.final_price ?? 0),
        })),
      ),
      rows: [],
      totals: {
        transactions_count: summary.transactions_count,
        products_sold: summary.products_sold,
      },
    };
  }

  async getGeneralReport(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const summary = this.buildSummaryMetrics(sales);
    const shopStats = shops.map((shop) =>
      this.toGeneralReportMetrics(
        this.buildSummaryMetrics(
          sales.filter((sale: any) => sale.branchCode === shop.branchCode),
        ),
        shop,
        { roundAverageMeasurementValue: 0 },
      ),
    );

    return {
      ...this.toGeneralReportMetrics(summary, undefined, {
        roundAverageMeasurementValue: 2,
      }),
      shop_stats: shopStats,
      sales_per_square: 0,
      target: 0,
      left_products_start_date: 0,
      left_products_supply_price_start_date: 0,
      left_products_retail_price_start_date: 0,
      left_products_end_date: 0,
      left_products_supply_price_end_date: 0,
      left_products_retail_price_end_date: 0,
    };
  }

  async getGeneralReportTable(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const detalization = this.optionalString(query.detalization) ?? 'day';
    const shopMap = new Map<string, any>(
      shops.map((shop) => [shop.branchCode, shop] as const),
    );
    const grouped = new Map<string, any[]>();

    for (const sale of sales) {
      const date = this.toPlotDate(sale.paidAt ?? sale.createdAt, detalization);
      const branchCode = sale.branchCode ?? '';
      const key = `${date}__${branchCode}`;
      const bucket = grouped.get(key) ?? [];
      bucket.push(sale);
      grouped.set(key, bucket);
    }

    const rows = [...grouped.entries()]
      .map(([key, bucket]) => {
        const [date, branchCode] = key.split('__');
        const shop = shopMap.get(branchCode);
        return {
          date,
          ...this.toGeneralReportMetrics(
            this.buildSummaryMetrics(bucket),
            shop
              ? {
                  id: shop.id,
                  name: shop.name,
                }
              : undefined,
            { roundAverageMeasurementValue: 2 },
          ),
          target: 0,
        };
      })
      .sort((a, b) =>
        a.date === b.date
          ? String(a.shop_name).localeCompare(String(b.shop_name))
          : String(a.date).localeCompare(String(b.date)),
      );
    const paginated = this.paginate(rows, query);

    return {
      shop_stats_by_date: paginated.items,
      count: rows.length,
      Err: null,
    };
  }

  async getGeneralSalesReport(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const field = this.optionalString(query.field) ?? 'gross_sales';
    const shopStats = shops
      .map((shop) => {
        const summary = this.buildSummaryMetrics(
          sales.filter((sale: any) => sale.branchCode === shop.branchCode),
        );
        return {
          shop_id: shop.id,
          shop_name: shop.name,
          value: this.resolveGeneralSalesField(summary, field),
        };
      })
      .sort((a, b) => b.value - a.value);

    return {
      shop_stats: shopStats,
      shop_plot: this.buildGeneralShopPlot(
        sales,
        shops,
        (bucket) => this.resolveGeneralSalesField(this.buildSummaryMetrics(bucket), field),
      ),
      value: shopStats.reduce((sum, item) => sum + item.value, 0),
      record_date: '',
    };
  }

  async getGeneralProductReport(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const field = this.optionalString(query.field) ?? 'sold_with_discount';
    const plotShops = await this.loadReportShops(context, query, [
      'plot_shop_ids',
      'shop_ids',
      'shopId',
      'shop_id',
    ]);
    const productGroups = new Map<string, any>();
    const categoryGroups = new Map<string, any>();
    const shopStats = shops.map((shop) => ({
      shop_id: shop.id,
      shop_name: shop.name,
      value: this.calculateProductMetric(
        sales.filter((sale: any) => sale.branchCode === shop.branchCode),
        field,
      ),
    }));

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        if (sign < 0) {
          continue;
        }
        const productKey = String(item.productId ?? item.name);
        const categoryKey = String(item.product?.category?.id ?? 'unknown');
        const productValue = this.resolveProductRankingValue(item, query);
        const categoryValue = this.resolveCategoryRankingValue(item, query);
        const existingProduct = productGroups.get(productKey) ?? {
          id: item.productId ? String(item.productId) : '',
          name: item.name,
          sku: item.sku ?? item.product?.sku ?? '',
          barcode: item.barcode ?? item.product?.barcode ?? '',
          measurement_value: 0,
          retail_price: 0,
          main_image_url: '',
          value: 0,
          base_name: item.name,
        };
        existingProduct.value += productValue;
        productGroups.set(productKey, existingProduct);

        const existingCategory = categoryGroups.get(categoryKey) ?? {
          category_id: item.product?.category?.id
            ? String(item.product.category.id)
            : '',
          name: item.product?.category?.name ?? '',
          measurement_value: 0,
          value: 0,
        };
        existingCategory.value += categoryValue;
        categoryGroups.set(categoryKey, existingCategory);
      }
    }

    return {
      shop_stats: shopStats,
      shop_plot: this.buildGeneralShopPlot(
        sales,
        plotShops,
        (bucket) => this.calculateProductMetric(bucket, field),
      ),
      value: this.calculateProductMetric(sales, field),
      current_left_products: null,
      top_products: [...productGroups.values()]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      top_categories: [...categoryGroups.values()]
        .sort((a, b) => b.value - a.value)
        .slice(0, 10),
      record_date: '',
    };
  }

  async getGeneralSellerReport(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const filter = this.reportsMapper.toFilterDto(query);
    const sellersReport = await this.sellerReportsService.getSellers(
      filter,
      authorization,
    );
    const topSellers = (sellersReport.rows ?? []).map((row: any) => ({
      seller_id: String(row.seller_id),
      name: row.seller_name,
      net_profit: Number(row.gross_profit ?? 0),
      net_sales: Number(row.net_gross_sales ?? 0),
      average_cheque: Number(row.average_cheque ?? 0),
      average_sold_measurement_value:
        Number(row.transactions_count ?? 0) > 0
          ? Number(row.products_sold ?? 0) / Number(row.transactions_count ?? 0)
          : 0,
      average_price:
        Number(row.products_sold ?? 0) > 0
          ? Number(row.net_gross_sales ?? 0) / Number(row.products_sold ?? 0)
          : 0,
      total_sold_measurement_value: Number(row.products_sold ?? 0),
    }));

    return {
      top_sellers: topSellers,
      count_others: 0,
      other_sellers: null,
    };
  }

  async getGeneralCustomerReport(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const plotShops = await this.loadReportShops(context, query, [
      'plot_shop_ids',
      'shop_ids',
      'shopId',
      'shop_id',
    ]);
    const field = this.optionalString(query.field) ?? 'new';
    const customerSales = sales.filter(
      (sale) =>
        sale.saleType !== 'return' &&
        this.buildCustomerReportKey(sale) &&
        (sale.clientId || sale.clientName),
    );
    const firstPurchaseByCustomer = await this.loadCustomerFirstPurchaseDates(
      customerSales,
      context,
    );
    const customerAggregates = new Map<
      string,
      {
        customer_id: string;
        name: string;
        count: number;
        amount: number;
        first_selected_purchase_at: Date;
      }
    >();
    const shopCustomerBuckets = new Map<
      string,
      { new: Set<string>; returned: Set<string> }
    >();
    const plotBuckets = new Map<
      string,
      { new: Set<string>; returned: Set<string> }
    >();

    for (const sale of customerSales) {
      const customerKey = this.buildCustomerReportKey(sale);
      const customerName = this.resolveCustomerReportName(sale);

      if (!customerKey || !customerName) {
        continue;
      }

      const existing = customerAggregates.get(customerKey) ?? {
        customer_id: sale.clientId ?? '',
        name: customerName,
        count: 0,
        amount: 0,
        first_selected_purchase_at: sale.paidAt ?? sale.createdAt,
      };
      const purchaseDate = sale.paidAt ?? sale.createdAt;
      existing.count += 1;
      existing.amount += this.getSaleNetAmount(sale);
      if (purchaseDate.getTime() < existing.first_selected_purchase_at.getTime()) {
        existing.first_selected_purchase_at = purchaseDate;
      }
      customerAggregates.set(customerKey, existing);
    }

    const customerTypes = new Map<string, 'new' | 'returned'>();

    for (const [customerKey, aggregate] of customerAggregates.entries()) {
      const firstPurchaseDate = firstPurchaseByCustomer.get(customerKey);
      const customerType =
        firstPurchaseDate &&
        firstPurchaseDate.getTime() <
          aggregate.first_selected_purchase_at.getTime()
          ? 'returned'
          : 'new';
      customerTypes.set(customerKey, customerType);
    }

    for (const sale of customerSales) {
      const customerKey = this.buildCustomerReportKey(sale);
      if (!customerKey) {
        continue;
      }

      const purchaseDate = sale.paidAt ?? sale.createdAt;
      const customerType = customerTypes.get(customerKey) ?? 'new';
      const branchCode = sale.branchCode ?? '';
      const shopBucket =
        shopCustomerBuckets.get(branchCode) ??
        { new: new Set<string>(), returned: new Set<string>() };
      shopBucket[customerType].add(customerKey);
      shopCustomerBuckets.set(branchCode, shopBucket);

      const plotKey = `${this.toPlotDate(purchaseDate)}__${branchCode}`;
      const plotBucket =
        plotBuckets.get(plotKey) ??
        { new: new Set<string>(), returned: new Set<string>() };
      plotBucket[customerType].add(customerKey);
      plotBuckets.set(plotKey, plotBucket);
    }

    const topClientEntry = [...customerAggregates.values()].sort(
      (a, b) => b.count - a.count,
    )[0];
    const topTransactionEntry = [...customerAggregates.values()].sort(
      (a, b) => b.amount - a.amount,
    )[0];
    const uniqueNewCustomers = new Set<string>();
    const uniqueReturnedCustomers = new Set<string>();

    for (const bucket of shopCustomerBuckets.values()) {
      for (const customerKey of bucket.new) {
        uniqueNewCustomers.add(customerKey);
      }
      for (const customerKey of bucket.returned) {
        uniqueReturnedCustomers.add(customerKey);
      }
    }

    return {
      shop_plot: this.buildGeneralShopPlot(
        customerSales,
        plotShops,
        (_bucket, day, shop) =>
          plotBuckets.get(`${day}__${shop.branchCode}`)?.[field === 'returned' ? 'returned' : 'new']
            ?.size ?? 0,
      ),
      top_client: topClientEntry
        ? {
            customer_id: topClientEntry.customer_id,
            name: topClientEntry.name,
            purchase_amount: topClientEntry.count,
          }
        : {
            customer_id: '',
            name: '',
            purchase_amount: 0,
          },
      top_transaction: topTransactionEntry
        ? {
            customer_id: topTransactionEntry.customer_id,
            name: topTransactionEntry.name,
            total_price: topTransactionEntry.amount,
          }
        : {
            customer_id: '',
            name: '',
            total_price: 0,
          },
      record_date: '',
      shop_stats: shops.map((shop) => {
        const bucket =
          shopCustomerBuckets.get(shop.branchCode) ??
          { new: new Set<string>(), returned: new Set<string>() };
        return {
          shop_id: shop.id,
          shop_name: shop.name,
          new: bucket.new.size,
          returned: bucket.returned.size,
        };
      }),
      new_count: uniqueNewCustomers.size,
      returned_count: uniqueReturnedCustomers.size,
    };
  }

  async getShops(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.db.shop.findMany({
      where: context?.companyId ? { companyId: context.companyId } : undefined,
      orderBy: { name: 'asc' },
    });
    const shopNameByBranchCode = new Map<string, string>(
      shops.map((shop: any) => [shop.branchCode, shop.name]),
    );
    const grouped = new Map<string, any[]>();

    for (const sale of sales) {
      const key = sale.branchCode ?? 'unknown';
      const bucket = grouped.get(key) ?? [];
      bucket.push(sale);
      grouped.set(key, bucket);
    }

    return {
      count: grouped.size,
      shop_stats: [...grouped.entries()].map(([branchCode, shopSales]) => {
        const summary = this.buildSummaryMetrics(shopSales);
        return {
          shop_id: branchCode,
          shop_name: shopNameByBranchCode.get(branchCode) ?? branchCode,
          branch_code: branchCode,
          ...summary,
        };
      }),
    };
  }

  async getShopDetail(
    shopId: string,
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const shop = await this.db.shop.findFirst({
      where: {
        ...(context?.companyId ? { companyId: context.companyId } : {}),
        OR: [{ id: shopId }, { branchCode: shopId }],
      },
    });
    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    const sales = await this.loadReportSales(
      {
        ...query,
        shopId: shop.id,
      },
      context,
    );
    const summary = this.buildSummaryMetrics(sales);
    const products = this.aggregateProducts(sales).slice(0, 10);
    const sellers = this.aggregateSellersFromSales(sales).slice(0, 10);

    return {
      shop: {
        id: shop.id,
        name: shop.name,
        branch_code: shop.branchCode,
      },
      summary,
      sales_by_day: this.groupSalesByDay(sales),
      profit_by_day: this.groupProfitByDay(sales),
      top_products: products,
      sellers,
      returns: sales.filter((sale) => sale.saleType === 'return').length,
      discounts: summary.discount_sum,
      stock_leftovers: [],
    };
  }

  async getProducts(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const items = this.aggregateProducts(sales);

    return {
      count: items.length,
      products: items,
      top_selling_products: [...items]
        .sort((a, b) => b.quantity_sold - a.quantity_sold)
        .slice(0, 10),
      most_profitable_products: [...items]
        .sort((a, b) => b.gross_profit - a.gross_profit)
        .slice(0, 10),
      low_margin_products: [...items]
        .sort((a, b) => a.margin_percent - b.margin_percent)
        .slice(0, 10),
      biggest_discount_products: [...items]
        .sort((a, b) => b.average_discount - a.average_discount)
        .slice(0, 10),
      slow_moving_products: [...items]
        .sort((a, b) => a.quantity_sold - b.quantity_sold)
        .slice(0, 10),
      low_stock_products: items.filter((item) => item.stock_left <= 5).slice(0, 10),
    };
  }

  async getProductSales(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const items = this.aggregateProductsDetailed(sales);
    const paginated = this.paginate(items, query);

    return {
      summary: this.buildSummaryMetrics(sales),
      filters: this.buildAppliedFilters(query),
      count: items.length,
      ...paginated,
      group_breakdown: this.buildProductBreakdown(items),
      top_selling_products: [...items]
        .sort((a, b) => b.sold_quantity - a.sold_quantity)
        .slice(0, 10),
      most_profitable_products: [...items]
        .sort((a, b) => b.gross_profit - a.gross_profit)
        .slice(0, 10),
      low_margin_products: [...items]
        .sort((a, b) => a.margin_percent - b.margin_percent)
        .slice(0, 10),
      biggest_discount_products: [...items]
        .sort((a, b) => b.average_discount - a.average_discount)
        .slice(0, 10),
    };
  }

  async getProductSalesReportApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const rows = this.flattenSaleItems(sales);
    const field = this.optionalString(query.field) ?? 'net_sales';
    const groupBy = this.optionalString(query.group_by) ?? 'name';
    const totals = new Map<string, number>();

    for (const row of rows) {
      const groupValue = this.resolveProductReportGroupValue(row, groupBy);
      totals.set(
        groupValue,
        (totals.get(groupValue) ?? 0) +
          this.resolveProductReportMetricValue(row, field),
      );
    }

    const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    const topEntries = sorted.slice(0, 10);
    const topNames = new Set(topEntries.map(([name]) => name));
    const daily = new Map<string, Record<string, number>>();

    for (const row of rows) {
      const day = this.toPlotDate(row.date);
      const bucket = daily.get(day) ?? {};
      const groupValue = this.resolveProductReportGroupValue(row, groupBy);
      const resolvedKey = topNames.has(groupValue) ? groupValue : 'others';
      bucket[resolvedKey] = (bucket[resolvedKey] ?? 0) +
        this.resolveProductReportMetricValue(row, field);
      daily.set(day, bucket);
    }

    const productPlot = daily.size
      ? [...daily.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([day, bucket]) => ({
            ...bucket,
            start_date: day,
          }))
      : [{ start_date: this.toPlotDate(this.parseDate(undefined) ?? new Date()) }];

    return {
      product_plot: productPlot,
      value: rows.reduce(
        (sum, row) => sum + this.resolveProductReportMetricValue(row, field),
        0,
      ),
      product_values: topEntries.map(([name, value]) => ({ name, value })),
      other_products_count: Math.max(0, sorted.length - topEntries.length),
      other_products_value: sorted
        .slice(10)
        .reduce((sum, [, value]) => sum + value, 0),
    };
  }

  async getProductGeneralReportApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const rows = this.flattenSaleItems(sales);
    const stockRows = await this.buildStockReportRows(query, context);

    return {
      product_sold: rows.reduce((sum, row) => sum + row.sold_measurement_value, 0),
      product_returned: rows.reduce(
        (sum, row) => sum + row.returned_measurement_value,
        0,
      ),
      net_gross_sales: rows.reduce((sum, row) => sum + row.net_sales, 0),
      net_gross_profit: rows.reduce((sum, row) => sum + row.net_profit, 0),
      products_left: stockRows.reduce((sum, row) => sum + row.measurement_value, 0),
      products_left_supply_price: stockRows.reduce(
        (sum, row) => sum + row.measurement_value * row.supply_price,
        0,
      ),
      products_left_retail_price: stockRows.reduce(
        (sum, row) => sum + row.measurement_value * row.retail_price,
        0,
      ),
      product_stats: null,
      shop_stats: null,
      count: 0,
    };
  }

  async getProductGeneralTableApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const shops = await this.loadReportShops(context, query);
    const shopByBranchCode = new Map<string, any>(
      shops.map((shop) => [shop.branchCode, shop] as const),
    );
    const rows = this.flattenSaleItems(sales).map((row) =>
      this.toProductGeneralTableRow(row, shopByBranchCode.get(row.branchCode)),
    );
    const paginated = this.paginate(rows, query);

    return {
      products_stats_by_date: paginated.items,
      products_stats_total: this.buildProductGeneralTotals(rows),
      count: rows.length,
    };
  }

  async getProductPerformanceReportApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const items = this.aggregateProductsDetailed(sales);
    const sorted = [...items].sort((a, b) => b.net_gross_sales - a.net_gross_sales);
    const topItems = sorted.slice(0, 10);
    const otherItems = sorted.slice(10);

    return {
      products: topItems.map((item) => ({
        product_field: item.product_name,
        main_image_url: '',
        net_sales: item.net_gross_sales,
        net_profit: item.gross_profit,
        total_sold_measurement_value: item.sold_quantity,
        total_returned_measurement_value: item.returned_quantity,
      })),
      other_products_count: otherItems.length,
      other_products_performance: {
        product_field: '',
        main_image_url: '',
        net_sales: otherItems.reduce((sum, item) => sum + item.net_gross_sales, 0),
        net_profit: otherItems.reduce((sum, item) => sum + item.gross_profit, 0),
        total_sold_measurement_value: otherItems.reduce(
          (sum, item) => sum + item.sold_quantity,
          0,
        ),
        total_returned_measurement_value: otherItems.reduce(
          (sum, item) => sum + item.returned_quantity,
          0,
        ),
      },
    };
  }

  async getProductEffectiveness(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const movements = await this.loadProductMovements(query, context);
    const products = await this.loadReportProducts(query, context);
    const rows = this.buildProductEffectiveness(products, sales, movements);
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        products_count: rows.length,
        sales_quantity: rows.reduce((sum, item) => sum + item.sold_quantity, 0),
        returns_quantity: rows.reduce((sum, item) => sum + item.returned_quantity, 0),
        write_off_quantity: rows.reduce((sum, item) => sum + item.write_off_quantity, 0),
        transfer_quantity: rows.reduce((sum, item) => sum + item.transfer_quantity, 0),
        ending_stock_quantity: rows.reduce(
          (sum, item) => sum + item.ending_stock,
          0,
        ),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getReportProductPerformanceTableApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const rows = await this.buildProductPerformanceRowsApi(query, context);
    const paginated = this.paginate(rows, query);

    return {
      table_data: paginated.items,
      count: rows.length,
      grouping_fields: '',
      group_without_shop: this.toBoolean(query.group_without_shop, false),
      group_with_supplier: this.toBoolean(query.group_with_supplier, false),
    };
  }

  async getReportProductPerformanceTotalsApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const rows = await this.buildProductPerformanceRowsApi(query, context);

    return {
      table_data: {
        stock_amount_begin: rows.reduce((sum, row) => sum + row.stock_amount_begin, 0),
        stock_supply_sum_begin: rows.reduce(
          (sum, row) => sum + row.stock_supply_sum_begin,
          0,
        ),
        stock_retail_sum_begin: rows.reduce(
          (sum, row) => sum + row.stock_retail_sum_begin,
          0,
        ),
        stock_amount_end: rows.reduce((sum, row) => sum + row.stock_amount_end, 0),
        stock_supply_sum_end: rows.reduce(
          (sum, row) => sum + row.stock_supply_sum_end,
          0,
        ),
        stock_retail_sum_end: rows.reduce(
          (sum, row) => sum + row.stock_retail_sum_end,
          0,
        ),
        import_amount: rows.reduce((sum, row) => sum + row.import_amount, 0),
        sold_amount: rows.reduce((sum, row) => sum + row.sold_amount, 0),
        returned_amount: rows.reduce((sum, row) => sum + row.returned_amount, 0),
        write_off_amount: rows.reduce((sum, row) => sum + row.write_off_amount, 0),
      },
      count: rows.length,
    };
  }

  async getProductImports(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const movements = await this.loadProductMovements(
      { ...query, movementType: 'PURCHASE' },
      context,
    );
    const rows = movements
      .filter((item: any) => item.type === 'PURCHASE')
      .map((item: any) => {
        const quantity = this.toNumber(item.quantity) ?? 0;
        const supplyPrice = Number(item.product?.purchasePrice ?? 0);
        const retailPrice = Number(item.product?.salePrice ?? 0);
        const currentStock = this.resolveStockLeft(item.product);
        const soldQuantity = Math.max(0, quantity - currentStock);
        const grossRevenue = soldQuantity * retailPrice;
        const grossProfit = soldQuantity * Math.max(0, retailPrice - supplyPrice);
        return {
          import_date: item.createdAt,
          supplier: item.product?.suppliers?.[0]?.supplier?.name ?? '',
          shop_name: item.shop?.name ?? '',
          product_id: item.productId,
          product_name: item.product?.name ?? '',
          quantity,
          supply_price: supplyPrice,
          retail_price: retailPrice,
          sold_quantity: soldQuantity,
          stock_left: currentStock,
          revenue: grossRevenue,
          gross_profit: grossProfit,
          margin_percent: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
        };
      });
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        imports_count: rows.length,
        items_quantity: rows.reduce((sum, item) => sum + item.quantity, 0),
        purchase_sum: rows.reduce(
          (sum, item) => sum + item.quantity * item.supply_price,
          0,
        ),
        potential_revenue: rows.reduce(
          (sum, item) => sum + item.quantity * item.retail_price,
          0,
        ),
        potential_profit: rows.reduce(
          (sum, item) =>
            sum + item.quantity * (item.retail_price - item.supply_price),
          0,
        ),
        sold_quantity: rows.reduce((sum, item) => sum + item.sold_quantity, 0),
        stock_left: rows.reduce((sum, item) => sum + item.stock_left, 0),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getImportReportTableApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const rows = await this.buildImportReportRows(query, context);
    const paginated = this.paginate(rows, query);

    return {
      rows: paginated.items,
      count: rows.length,
    };
  }

  async getImportReportTotalsApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const rows = await this.buildImportReportRows(query, context);

    return {
      imported: rows.reduce((sum, row) => sum + row.imported_qty, 0),
      imported_retail_sum: rows.reduce(
        (sum, row) => sum + row.imported_retail_sum,
        0,
      ),
      imported_supply_sum: rows.reduce(
        (sum, row) => sum + row.imported_supply_sum,
        0,
      ),
      sold: rows.reduce((sum, row) => sum + row.sold_qty, 0),
      sold_retail_sum: rows.reduce((sum, row) => sum + row.sold_retail_sum, 0),
      sold_supply_sum: rows.reduce((sum, row) => sum + row.sold_supply_sum, 0),
      sold_sale_sum: rows.reduce((sum, row) => sum + row.sold_sale_sum, 0),
      written_off: rows.reduce((sum, row) => sum + row.written_off_qty, 0),
      written_off_retail_sum: rows.reduce(
        (sum, row) => sum + row.written_off_retail_sum,
        0,
      ),
      written_off_supply_sum: rows.reduce(
        (sum, row) => sum + row.written_off_supply_sum,
        0,
      ),
      transfer_finished: rows.reduce(
        (sum, row) => sum + row.transfer_finished_qty,
        0,
      ),
      transfer_finished_retail_sum: rows.reduce(
        (sum, row) => sum + row.transfer_finished_retail_sum,
        0,
      ),
      transfer_finished_supply_sum: rows.reduce(
        (sum, row) => sum + row.transfer_finished_supply_sum,
        0,
      ),
      transfer_arrived: rows.reduce(
        (sum, row) => sum + row.transfer_arrived_qty,
        0,
      ),
      transfer_arrived_retail_sum: rows.reduce(
        (sum, row) => sum + row.transfer_arrived_retail_price,
        0,
      ),
      transfer_arrived_supply_sum: rows.reduce(
        (sum, row) => sum + row.transfer_arrived_supply_sum,
        0,
      ),
      repricing: rows.reduce((sum, row) => sum + row.repricing_qty, 0),
      repricing_retail_sum: rows.reduce(
        (sum, row) => sum + row.repricing_retail_sum,
        0,
      ),
      repricing_supply_sum: rows.reduce(
        (sum, row) => sum + row.repricing_supply_sum,
        0,
      ),
      returned: rows.reduce((sum, row) => sum + row.returned, 0),
      returned_retail_sum: rows.reduce(
        (sum, row) => sum + row.returned_retail_sum,
        0,
      ),
      returned_supply_sum: rows.reduce(
        (sum, row) => sum + row.returned_supply_sum,
        0,
      ),
      returned_sale_sum: rows.reduce(
        (sum, row) => sum + row.returned_sale_sum,
        0,
      ),
      returned_supplier_order: rows.reduce(
        (sum, row) => sum + row.return_supplier_order_qty,
        0,
      ),
      returned_supplier_order_retail_sum: rows.reduce(
        (sum, row) => sum + row.return_supplier_order_retail_sum,
        0,
      ),
      returned_supplier_order_supply_sum: rows.reduce(
        (sum, row) => sum + row.return_supplier_order_supply_sum,
        0,
      ),
      left: rows.reduce((sum, row) => sum + row.left_qty, 0),
      left_retail_sum: rows.reduce((sum, row) => sum + row.left_retail_sum, 0),
      left_supply_sum: rows.reduce((sum, row) => sum + row.left_supply_sum, 0),
    };
  }

  async getProductSuppliers(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const rows = this.aggregateSuppliers(sales);
    const paginated = this.paginate(rows, query);

    return {
      count: rows.length,
      ...paginated,
    };
  }

  async getProductSellsBySuppliersTableApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const rows = this.buildSupplierSalesRows(sales, query);
    const paginated = this.paginate(rows, query);

    return {
      products_stats_by_date: paginated.items,
      products_stats_total: this.buildProductGeneralTotals(rows),
      count: rows.length,
      Err: null,
    };
  }

  async getProductStocks(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const products = await this.loadReportProducts(query, context);
    const rows = this.buildProductStocks(products, query);
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        sku_count: rows.length,
        total_quantity: rows.reduce((sum, item) => sum + item.stock_quantity, 0),
        stock_supply_total: rows.reduce((sum, item) => sum + item.stock_supply_total, 0),
        stock_retail_total: rows.reduce((sum, item) => sum + item.stock_retail_total, 0),
        potential_profit: rows.reduce((sum, item) => sum + item.potential_profit, 0),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getStockReportTableApi(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const rows = await this.buildStockReportRows(query, context);
    const paginated = this.paginate(rows, query);

    return {
      rows: paginated.items,
      count: rows.length,
    };
  }

  async getInventoryResults(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const movements = await this.loadProductMovements(
      { ...query, movementType: 'WRITE_OFF' },
      context,
    );
    const rows = movements
      .filter((item: any) => item.type === 'WRITE_OFF')
      .map((item: any) => ({
        product_id: item.productId,
        product_name: item.product?.name ?? '',
        sku: item.product?.sku ?? '',
        expected_quantity: Number(item.beforeQuantity ?? 0),
        actual_quantity: Number(item.afterQuantity ?? 0),
        difference: Number(item.afterQuantity ?? 0) - Number(item.beforeQuantity ?? 0),
        difference_cost:
          (Number(item.afterQuantity ?? 0) - Number(item.beforeQuantity ?? 0)) *
          Number(item.product?.purchasePrice ?? 0),
        reason: 'Stock correction',
        responsible: this.buildUserName(item.createdBy),
        date: item.createdAt,
      }));
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        records_count: rows.length,
        shortage_count: rows.filter((item) => item.difference < 0).length,
        surplus_count: rows.filter((item) => item.difference > 0).length,
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getOrderReturns(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const rows = sales
      .filter((sale: any) => sale.saleType === 'return')
      .flatMap((sale: any) =>
        sale.items.map((item: any) => ({
          date: sale.paidAt ?? sale.createdAt,
          supplier: item.product?.suppliers?.[0]?.supplier?.name ?? '',
          product_id: item.productId,
          product_name: item.name,
          quantity: item.quantity,
          return_amount: this.getItemFinalPrice(item),
          reason: 'Customer return',
          responsible: this.buildUserName(sale.user),
        })),
      );
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        returns_count: rows.length,
        returns_quantity: rows.reduce((sum, item) => sum + item.quantity, 0),
        returns_amount: rows.reduce((sum, item) => sum + item.return_amount, 0),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getWriteOffs(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const movements = await this.loadProductMovements(
      { ...query, movementType: 'WRITE_OFF' },
      context,
    );
    const rows = movements
      .filter((item: any) => item.type === 'WRITE_OFF')
      .map((item: any) => {
        const quantity = Math.abs(this.toNumber(item.quantity) ?? 0);
        const supplyPrice = Number(item.product?.purchasePrice ?? 0);
        return {
          date: item.createdAt,
          shop_name: item.shop?.name ?? '',
          product_id: item.productId,
          product_name: item.product?.name ?? '',
          quantity,
          reason: 'Write-off',
          supply_price: supplyPrice,
          write_off_sum: quantity * supplyPrice,
          responsible: this.buildUserName(item.createdBy),
        };
      });
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        write_offs_count: rows.length,
        quantity: rows.reduce((sum, item) => sum + item.quantity, 0),
        write_off_sum: rows.reduce((sum, item) => sum + item.write_off_sum, 0),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getAbcAnalysis(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const items = this.aggregateProductsDetailed(sales);
    const method = this.optionalString(query.method) ?? 'revenue';
    const metricKey =
      method === 'profit'
        ? 'gross_profit'
        : method === 'quantity'
          ? 'sold_quantity'
          : 'net_gross_sales';
    const sorted = [...items].sort((a, b) => b[metricKey] - a[metricKey]);
    const total = sorted.reduce((sum, item) => sum + item[metricKey], 0);
    let cumulative = 0;
    const rows = sorted.map((item) => {
      const value = item[metricKey];
      cumulative += value;
      const sharePercent = total > 0 ? (value / total) * 100 : 0;
      const cumulativePercent = total > 0 ? (cumulative / total) * 100 : 0;
      const abcSegment =
        cumulativePercent <= 80 ? 'A' : cumulativePercent <= 95 ? 'B' : 'C';

      return {
        product_id: item.product_id,
        product_name: item.product_name,
        revenue: item.net_gross_sales,
        gross_profit: item.gross_profit,
        sales_quantity: item.sold_quantity,
        share_percent: sharePercent,
        abc_segment: abcSegment,
      };
    });
    const paginated = this.paginate(rows, query);

    return {
      method,
      total_metric: total,
      count: rows.length,
      ...paginated,
    };
  }

  async getTransfers(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const movements = await this.loadProductMovements(
      { ...query, movementType: 'TRANSFER' },
      context,
    );
    const rows = movements
      .filter((item: any) => item.type === 'TRANSFER')
      .map((item: any) => {
        const quantity = Math.abs(this.toNumber(item.quantity) ?? 0);
        const supplyPrice = Number(item.product?.purchasePrice ?? 0);
        return {
          date: item.createdAt,
          from_shop: item.shop?.name ?? '',
          to_shop: '',
          product_id: item.productId,
          product_name: item.product?.name ?? '',
          quantity,
          supply_price: supplyPrice,
          total_sum: quantity * supplyPrice,
          responsible: this.buildUserName(item.createdBy),
          status: 'accepted',
        };
      });
    const paginated = this.paginate(rows, query);

    return {
      summary: {
        transfers_count: rows.length,
        quantity: rows.reduce((sum, item) => sum + item.quantity, 0),
        total_sum: rows.reduce((sum, item) => sum + item.total_sum, 0),
      },
      count: rows.length,
      ...paginated,
    };
  }

  async getSellers(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    return this.sellerReportsService.getSellers(
      this.reportsMapper.toFilterDto(query),
      authorization,
    );
  }

  async getSellerSales(
    sellerId: string,
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    return this.sellerReportsService.getSellerSales(
      sellerId,
      this.reportsMapper.toFilterDto(query),
      authorization,
    );
  }

  async getSellerDetail(
    sellerId: string,
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const parsedSellerId = this.parseSellerId(sellerId);
    const salesReport = await this.getSellerSales(sellerId, query, authorization);
    const salaryReport = await this.getSellerSalaryReport(
      sellerId,
      query,
      authorization,
    );

    return {
      seller_id: parsedSellerId,
      summary: salesReport.summary,
      sales_by_day: salesReport.chart,
      profit_by_day: salesReport.chart,
      sold_items: salaryReport.items,
      salary: salaryReport,
      discounts: salesReport.summary.discount_sum,
      returns: salesReport.summary.returns_count,
    };
  }

  async getCustomers(
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    const context = await this.getContext(authorization);
    const sales = await this.loadReportSales(query, context);
    const customers = new Map<string, any>();

    for (const sale of sales.filter((item) => item.saleType !== 'return')) {
      const key = (sale.clientName ?? '').trim() || 'Без имени';
      const existing = customers.get(key) ?? {
        client: key,
        phone: '',
        purchases_count: 0,
        total_amount: 0,
        average_cheque: 0,
        last_purchase: sale.paidAt ?? sale.createdAt,
        purchased_products: new Set<string>(),
      };

      existing.purchases_count += 1;
      existing.total_amount += this.getSaleNetAmount(sale);
      existing.last_purchase =
        existing.last_purchase > (sale.paidAt ?? sale.createdAt)
          ? existing.last_purchase
          : sale.paidAt ?? sale.createdAt;
      for (const item of sale.items) {
        existing.purchased_products.add(item.name);
      }
      customers.set(key, existing);
    }

    return {
      count: customers.size,
      customers: [...customers.values()].map((customer) => {
        const averageCheque =
          customer.purchases_count > 0
            ? customer.total_amount / customer.purchases_count
            : 0;
        return {
          client: customer.client,
          phone: customer.phone,
          purchases_count: customer.purchases_count,
          total_amount: customer.total_amount,
          average_cheque: averageCheque,
          last_purchase: customer.last_purchase,
          purchased_products: [...customer.purchased_products],
          status: this.resolveCustomerStatus(
            customer.purchases_count,
            customer.total_amount,
            customer.last_purchase,
          ),
        };
      }),
    };
  }

  async getSellerSalarySettings(
    sellerId: string,
    authorization?: string,
  ) {
    return this.sellerReportsService.getSellerSalarySettings(
      sellerId,
      authorization,
    );
  }

  async updateSellerSalarySettings(
    sellerId: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    return this.sellerReportsService.updateSellerSalarySettings(
      sellerId,
      body,
      authorization,
    );
  }

  async getSellerSalaryReport(
    sellerId: string,
    query: Record<string, string | undefined>,
    authorization?: string,
  ) {
    return this.sellerReportsService.getSellerSalaryReport(
      sellerId,
      this.reportsMapper.toFilterDto(query),
      authorization,
    );
  }

  private async getContext(authorization?: string) {
    return authorization
      ? this.usersService.getRequestContext(authorization)
      : null;
  }

  private async loadReportSales(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const where = await this.buildReportWhere(query, context);
    return this.db.sale.findMany({
      where,
      take: MAX_REPORT_RECORDS,
      include: {
        user: true,
        items: {
          include: {
            product: {
              include: {
                category: true,
                brand: true,
                stocks: true,
                suppliers: {
                  include: {
                    supplier: true,
                  },
                },
              },
            },
            seller: true,
          },
        },
      },
      orderBy: {
        paidAt: 'desc',
      },
    });
  }

  private async loadReportShops(
    context: any,
    query: Record<string, string | undefined>,
    keys = ['shop_ids', 'shopId', 'shop_id'],
  ) {
    const requestedShopIds = this.extractQueryStringArray(query, ...keys);
    const where: Record<string, unknown> = {};

    if (context?.companyId) {
      where.companyId = context.companyId;
    }

    if (requestedShopIds.length) {
      where.OR = [
        { id: { in: requestedShopIds } },
        { branchCode: { in: requestedShopIds } },
      ];
    }

    const shops = await this.db.shop.findMany({
      where,
      orderBy: { name: 'asc' },
    });

    if (shops.length) {
      return shops;
    }

    return requestedShopIds.map((shopId) => ({
      id: shopId,
      name: shopId,
      branchCode: shopId,
    }));
  }

  private async loadReportProducts(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const where = await this.buildProductWhere(query, context);
    return this.db.product.findMany({
      where,
      take: MAX_REPORT_RECORDS,
      include: {
        category: true,
        brand: true,
        stocks: true,
        suppliers: {
          include: {
            supplier: true,
          },
        },
      },
      orderBy: {
        name: 'asc',
      },
    });
  }

  private async loadProductMovements(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const where = await this.buildStockMovementWhere(query, context);
    return this.db.stockMovement.findMany({
      where,
      take: MAX_REPORT_RECORDS,
      include: {
        shop: true,
        product: {
          include: {
            category: true,
            brand: true,
            stocks: true,
            suppliers: {
              include: {
                supplier: true,
              },
            },
          },
        },
        createdBy: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  private async buildReportWhere(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const and: Record<string, unknown>[] = [
      {
        status: {
          in: [
            'paid',
            'returned',
            'partially_returned',
            'exchanged',
            'partially_exchanged',
          ],
        },
      },
    ];
    if (context?.companyId) {
      and.push({ companyId: context.companyId });
    }
    if (context?.allowedBranchCodes?.length) {
      and.push({ branchCode: { in: context.allowedBranchCodes } });
    }

    const from = this.parseDate(this.firstQueryValue(query, 'from', 'date_from', 'dateFrom', 'start_date', 'startDate'));
    const to = this.parseDate(this.firstQueryValue(query, 'to', 'date_to', 'dateTo', 'end_date', 'endDate'));
    if (from || to) {
      and.push({
        paidAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: this.toEndOfDay(to) } : {}),
        },
      });
    }

    const branchCodes = await this.resolveShopBranchCodesFromQuery(query, context, [
      'shop_ids',
      'shopId',
      'shop_id',
    ]);
    if (branchCodes.length) {
      and.push({ branchCode: { in: branchCodes } });
    }

    const sellerId = this.toInt(this.firstQueryValue(query, 'sellerId', 'seller_id'));
    if (sellerId) {
      and.push({ userId: sellerId });
    }

    const productId = this.toInt(this.firstQueryValue(query, 'productId', 'product_id'));
    const categoryId = this.toInt(this.firstQueryValue(query, 'categoryId', 'category_id'));
    const brandId = this.toInt(this.firstQueryValue(query, 'brandId', 'brand_id'));
    const supplierId = this.toInt(this.firstQueryValue(query, 'supplierId', 'supplier_id'));
    if (productId || categoryId || brandId || supplierId) {
      const productWhere: Record<string, unknown> = {};
      if (categoryId) {
        productWhere.categoryId = categoryId;
      }
      if (brandId) {
        productWhere.brandId = brandId;
      }
      and.push({
        items: {
          some: {
            ...(productId ? { productId } : {}),
            ...(Object.keys(productWhere).length || supplierId
              ? {
                  product: {
                    ...productWhere,
                    ...(supplierId
                      ? {
                          suppliers: {
                            some: {
                              supplierId,
                            },
                          },
                        }
                      : {}),
                  },
                }
              : {}),
          },
        },
      });
    }

    return {
      AND: and,
    };
  }

  private async buildProductWhere(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const and: Record<string, unknown>[] = [];
    if (context?.companyId) {
      and.push({ companyId: context.companyId });
    }

    const productId = this.toInt(this.firstQueryValue(query, 'productId', 'product_id'));
    if (productId) {
      and.push({ id: productId });
    }

    const categoryId = this.toInt(this.firstQueryValue(query, 'categoryId', 'category_id'));
    if (categoryId) {
      and.push({ categoryId });
    }

    const brandId = this.toInt(this.firstQueryValue(query, 'brandId', 'brand_id'));
    if (brandId) {
      and.push({ brandId });
    }

    const supplierId = this.toInt(this.firstQueryValue(query, 'supplierId', 'supplier_id'));
    if (supplierId) {
      and.push({
        suppliers: {
          some: {
            supplierId,
          },
        },
      });
    }

    const branchCodes = await this.resolveShopBranchCodesFromQuery(query, context, [
      'shop_ids',
      'shopId',
      'shop_id',
    ]);
    if (branchCodes.length) {
      and.push({
        stocks: {
          some: {
            branchCode: {
              in: branchCodes,
            },
          },
        },
      });
    }

    return and.length ? { AND: and } : undefined;
  }

  private async buildStockMovementWhere(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const and: Record<string, unknown>[] = [];
    if (context?.companyId) {
      and.push({ companyId: context.companyId });
    }

    const from = this.parseDate(this.firstQueryValue(query, 'from', 'date_from', 'dateFrom', 'start_date', 'startDate'));
    const to = this.parseDate(this.firstQueryValue(query, 'to', 'date_to', 'dateTo', 'end_date', 'endDate'));
    if (from || to) {
      and.push({
        createdAt: {
          ...(from ? { gte: from } : {}),
          ...(to ? { lte: this.toEndOfDay(to) } : {}),
        },
      });
    }

    const movementType = this.optionalString(this.firstQueryValue(query, 'movementType', 'movement_type'));
    if (movementType) {
      and.push({ type: movementType });
    }

    const productId = this.toInt(this.firstQueryValue(query, 'productId', 'product_id'));
    if (productId) {
      and.push({ productId });
    }

    const shopIds = await this.resolveShopIdsFromQuery(query, context, [
      'shop_ids',
      'shopId',
      'shop_id',
    ]);
    if (shopIds.length) {
      and.push({ shopId: { in: shopIds } });
    }

    const categoryId = this.toInt(this.firstQueryValue(query, 'categoryId', 'category_id'));
    const brandId = this.toInt(this.firstQueryValue(query, 'brandId', 'brand_id'));
    const supplierId = this.toInt(this.firstQueryValue(query, 'supplierId', 'supplier_id'));
    if (categoryId || brandId || supplierId) {
      and.push({
        product: {
          ...(categoryId ? { categoryId } : {}),
          ...(brandId ? { brandId } : {}),
          ...(supplierId
            ? {
                suppliers: {
                  some: {
                    supplierId,
                  },
                },
              }
            : {}),
        },
      });
    }

    return and.length ? { AND: and } : undefined;
  }

  private buildSummaryMetrics(sales: any[]) {
    const metrics = {
      gross_sales: 0,
      net_gross_sales: 0,
      gross_profit: 0,
      average_cheque: 0,
      transactions_count: sales.length,
      products_sold: 0,
      discount_sum: 0,
      discount_percent: 0,
      average_extra_charge: 0,
      returns_count: 0,
      exchanges_count: 0,
    };
    let totalSupply = 0;

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      if (sale.saleType === 'return') {
        metrics.returns_count += 1;
      }
      if (sale.saleType === 'exchange') {
        metrics.exchanges_count += 1;
      }

      for (const item of sale.items) {
        const gross = this.getItemRetailPrice(item);
        const net = this.getItemFinalPrice(item);
        const discount = this.getItemDiscount(item);
        const profit = this.getItemProfit(item);
        const supply = this.getItemSupplyPrice(item);

        metrics.gross_sales += gross * sign;
        metrics.net_gross_sales += net * sign;
        metrics.gross_profit += profit * sign;
        metrics.discount_sum += discount * sign;
        metrics.products_sold += item.quantity * sign;
        totalSupply += supply * sign;
      }
    }

    metrics.average_cheque =
      metrics.transactions_count > 0
        ? metrics.net_gross_sales / metrics.transactions_count
        : 0;
    metrics.discount_percent =
      metrics.gross_sales !== 0
        ? (metrics.discount_sum / metrics.gross_sales) * 100
        : 0;
    metrics.average_extra_charge =
      totalSupply > 0 ? (metrics.gross_profit / totalSupply) * 100 : 0;

    return metrics;
  }

  private buildSummaryMetricsFromFacts(rows: any[]) {
    const metrics = {
      gross_sales: 0,
      net_gross_sales: 0,
      gross_profit: 0,
      average_cheque: 0,
      transactions_count: 0,
      products_sold: 0,
      discount_sum: 0,
      discount_percent: 0,
      average_extra_charge: 0,
      returns_count: 0,
      exchanges_count: 0,
    };
    const transactions = new Set<number>();
    const returnTransactions = new Set<number>();
    const exchangeTransactions = new Set<number>();
    let totalSupply = 0;

    for (const row of rows) {
      const sign = row.sale_type === 'return' ? -1 : 1;
      transactions.add(Number(row.sale_id));
      if (row.sale_type === 'return') {
        returnTransactions.add(Number(row.sale_id));
      }
      if (row.sale_type === 'exchange') {
        exchangeTransactions.add(Number(row.sale_id));
      }

      const gross = Number(row.retail_price_at_sale ?? 0);
      const net = Number(row.final_price ?? 0);
      const supply = Number(row.supply_price_at_sale ?? 0);
      const profit = Number(row.profit_at_sale ?? 0);
      const discount = Number(row.discount_amount ?? 0);
      const quantity = Number(row.quantity ?? 0);

      metrics.gross_sales += gross * sign;
      metrics.net_gross_sales += net * sign;
      metrics.gross_profit += profit * sign;
      metrics.discount_sum += discount * sign;
      metrics.products_sold += quantity * sign;
      totalSupply += supply * sign;
    }

    metrics.transactions_count = transactions.size;
    metrics.returns_count = returnTransactions.size;
    metrics.exchanges_count = exchangeTransactions.size;
    metrics.average_cheque =
      metrics.transactions_count > 0
        ? metrics.net_gross_sales / metrics.transactions_count
        : 0;
    metrics.discount_percent =
      metrics.gross_sales !== 0
        ? (metrics.discount_sum / metrics.gross_sales) * 100
        : 0;
    metrics.average_extra_charge =
      totalSupply > 0 ? (metrics.gross_profit / totalSupply) * 100 : 0;

    return metrics;
  }

  private aggregateProducts(sales: any[]) {
    const products = new Map<string, any>();

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        const key = String(item.productId ?? item.name);
        const existing = products.get(key) ?? {
          product_id: item.productId ?? null,
          product_name: item.name,
          sku: item.sku ?? '',
          category: item.product?.category?.name ?? '',
          brand: item.product?.brand?.name ?? '',
          quantity_sold: 0,
          gross_sales: 0,
          net_gross_sales: 0,
          sold_cost_price: 0,
          gross_profit: 0,
          margin_percent: 0,
          average_discount: 0,
          stock_left: this.resolveStockLeft(item.product),
          returns: 0,
          _discount_count: 0,
        };
        existing.quantity_sold += item.quantity * sign;
        existing.gross_sales += this.getItemRetailPrice(item) * sign;
        existing.net_gross_sales += this.getItemFinalPrice(item) * sign;
        existing.sold_cost_price += this.getItemSupplyPrice(item) * sign;
        existing.gross_profit += this.getItemProfit(item) * sign;
        existing.average_discount += this.getItemDiscount(item);
        existing._discount_count += 1;
        if (sale.saleType === 'return') {
          existing.returns += Number(item.quantity);
        }
        products.set(key, existing);
      }
    }

    return [...products.values()].map((item) => ({
      ...item,
      average_discount:
        item._discount_count > 0
          ? item.average_discount / item._discount_count
          : 0,
      margin_percent:
        item.net_gross_sales > 0
          ? (item.gross_profit / item.net_gross_sales) * 100
          : 0,
    }));
  }

  private aggregateProductsDetailed(sales: any[]) {
    const products = new Map<string, any>();

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        const key = String(item.productId ?? item.name);
        const metadata = this.parseProductMetadata(item.product?.metadata);
        const current = products.get(key) ?? {
          product_id: item.productId ?? null,
          product_name: item.name,
          sku: item.sku ?? item.product?.sku ?? '',
          barcode: item.barcode ?? item.product?.barcode ?? '',
          category: item.product?.category?.name ?? '',
          brand: item.product?.brand?.name ?? '',
          color: metadata.color ?? '',
          size: metadata.size ?? '',
          characteristics: metadata.characteristics,
          sold_quantity: 0,
          returned_quantity: 0,
          stock_left: this.resolveStockLeft(item.product),
          revenue: 0,
          net_gross_sales: 0,
          supply_cost: 0,
          gross_profit: 0,
          margin_percent: 0,
          average_discount: 0,
          average_price: 0,
          average_markup: 0,
          _count: 0,
          _markup_count: 0,
        };

        const itemQuantity = Number(item.quantity);
        current.sold_quantity += sign > 0 ? itemQuantity : 0;
        current.returned_quantity += sign < 0 ? itemQuantity : 0;
        current.revenue += this.getItemRetailPrice(item) * sign;
        current.net_gross_sales += this.getItemFinalPrice(item) * sign;
        current.supply_cost += this.getItemSupplyPrice(item) * sign;
        current.gross_profit += this.getItemProfit(item) * sign;
        current.average_discount += this.getItemDiscount(item);
        current.average_price += itemQuantity
          ? this.getItemFinalPrice(item) / itemQuantity
          : 0;
        if (item.markupAtSale !== undefined && item.markupAtSale !== null) {
          current.average_markup += Number(item.markupAtSale);
          current._markup_count += 1;
        } else {
          const supply = this.getItemSupplyPrice(item);
          current.average_markup += supply > 0 ? this.getItemFinalPrice(item) / supply : 0;
          current._markup_count += 1;
        }
        current._count += 1;
        products.set(key, current);
      }
    }

    return [...products.values()].map((item) => ({
      ...item,
      average_discount: item._count > 0 ? item.average_discount / item._count : 0,
      average_price: item._count > 0 ? item.average_price / item._count : 0,
      average_markup:
        item._markup_count > 0 ? item.average_markup / item._markup_count : 0,
      margin_percent:
        item.net_gross_sales > 0
          ? (item.gross_profit / item.net_gross_sales) * 100
          : 0,
    }));
  }

  private flattenSaleItems(sales: any[]) {
    return sales.flatMap((sale: any) =>
      sale.items.map((item: any) => {
        const sign = this.getSaleSign(sale);
        const product = item.product ?? null;
        const date = sale.paidAt ?? sale.createdAt;
        const metadata = this.parseProductMetadata(product?.metadata);
        return {
          sale,
          item,
          product,
          branchCode: sale.branchCode ?? '',
          date,
          sold_measurement_value: sign > 0 ? Number(item.quantity ?? 0) : 0,
          returned_measurement_value: sign < 0 ? Number(item.quantity ?? 0) : 0,
          net_sold_measurement_value: Number(item.quantity ?? 0) * sign,
          gross_sales: this.getItemRetailPrice(item) * sign,
          returned_sales_sum: sign < 0 ? this.getItemFinalPrice(item) : 0,
          net_sales: this.getItemFinalPrice(item) * sign,
          net_profit: this.getItemProfit(item) * sign,
          sold_supply_sum: this.getItemSupplyPrice(item) * sign,
          average_margin:
            this.getItemSupplyPrice(item) > 0
              ? this.getItemFinalPrice(item) / this.getItemSupplyPrice(item)
              : 0,
          discount:
            this.getItemRetailPrice(item) > 0
              ? (this.getItemDiscount(item) / this.getItemRetailPrice(item)) * 100
              : 0,
          sold_with_discount: this.getItemFinalPrice(item) * sign,
          sold_without_discount: this.getItemDiscount(item) > 0 ? 0 : this.getItemFinalPrice(item) * sign,
          color: metadata.color ?? '',
          size: metadata.size ?? '',
          characteristics: metadata.characteristics ?? [],
        };
      }),
    );
  }

  private resolveProductReportMetricValue(row: any, field: string) {
    switch (field) {
      case 'gross_sales':
        return Number(row.gross_sales ?? 0);
      case 'net_profit':
      case 'gross_profit':
        return Number(row.net_profit ?? 0);
      case 'sold_qty':
        return Number(row.sold_measurement_value ?? 0);
      case 'sold_with_discount':
        return Number(row.sold_with_discount ?? 0);
      case 'net_sales':
      default:
        return Number(row.net_sales ?? 0);
    }
  }

  private resolveProductReportGroupValue(row: any, groupBy: string) {
    switch (groupBy) {
      case 'category':
        return this.optionalString(row.product?.category?.name) ?? row.item.name;
      case 'brand':
        return this.optionalString(row.product?.brand?.name) ?? row.item.name;
      case 'color':
        return this.optionalString(row.color) ?? row.item.name;
      case 'size':
        return this.optionalString(row.size) ?? row.item.name;
      case 'name':
      default:
        return row.item.name;
    }
  }

  private toProductGeneralTableRow(row: any, shop?: any) {
    const product = row.product ?? {};
    const categories = product?.category ? [product.category] : [];
    const categoryPath = product?.category?.name ? [product.category.name] : [];
    return {
      date: this.toPlotDate(row.date),
      product_id: product.publicId ?? product.id ?? '',
      order_number: row.sale?.number ?? '',
      shop_id: shop?.id ?? '',
      shop_name: shop?.name ?? row.branchCode ?? '',
      product_name: row.item.name,
      product_base_name: '',
      product_sku: row.item.sku ?? product.sku ?? '',
      product_barcode: row.item.barcode ?? product.barcode ?? '',
      product_brand_id: JSON.stringify(product?.brand?.id ?? ''),
      product_brand_name: product?.brand?.name ?? '',
      free_price: false,
      used_wholesale_price: false,
      supplier_id:
        product?.suppliers?.[0]?.supplier?.id ??
        '00000000-0000-0000-0000-000000000000',
      supplier_external_id: 0,
      product_categories: categories,
      categories_path: categoryPath,
      level_1: categoryPath,
      level_2: [],
      level_3: [],
      level_4: [],
      level_5: [],
      product_measurement_unit_id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
      product_measurement_unit_name: 'Штука',
      product_measurement_unit_short_name: 'шт',
      product_attributes: [],
      product_is_archived: Boolean(product?.archivedAt),
      product_suppliers: '',
      customer_full_name: row.sale?.clientName ?? '',
      customer_phone_number: '',
      seller_full_name: this.buildUserName(row.item?.seller ?? row.sale?.user),
      cashier_full_name: this.buildUserName(row.sale?.user),
      transaction_type: row.sale?.saleType ?? '',
      order_id: String(row.sale?.id ?? ''),
      movement_id: '',
      sold_measurement_value: row.sold_measurement_value,
      returned_measurement_value: row.returned_measurement_value,
      net_sold_measurement_value: row.net_sold_measurement_value,
      gross_sales: row.gross_sales,
      returned_sales_sum: row.returned_sales_sum,
      net_sales: row.net_sales,
      net_profit: row.net_profit,
      sold_supply_sum: row.sold_supply_sum,
      average_margin: row.average_margin,
      discount: row.discount,
      sold_with_discount: row.sold_with_discount,
      sold_without_discount: row.sold_without_discount,
      left_start_date: 0,
      left_start_date_supply_price: 0,
      left_start_date_retail_price: 0,
      left_end_date: 0,
      left_end_date_supply_price: 0,
      left_end_date_retail_price: 0,
      custom_fields: [],
    };
  }

  private buildProductGeneralTotals(rows: any[]) {
    return {
      sold_measurement_value: rows.reduce(
        (sum, row) => sum + Number(row.sold_measurement_value ?? 0),
        0,
      ),
      returned_measurement_value: rows.reduce(
        (sum, row) => sum + Number(row.returned_measurement_value ?? 0),
        0,
      ),
      net_sold_measurement_value: rows.reduce(
        (sum, row) => sum + Number(row.net_sold_measurement_value ?? 0),
        0,
      ),
      gross_sales: rows.reduce((sum, row) => sum + Number(row.gross_sales ?? 0), 0),
      returned_sales_sum: rows.reduce(
        (sum, row) => sum + Number(row.returned_sales_sum ?? 0),
        0,
      ),
      net_sales: rows.reduce((sum, row) => sum + Number(row.net_sales ?? 0), 0),
      net_profit: rows.reduce((sum, row) => sum + Number(row.net_profit ?? 0), 0),
      sold_supply_sum: rows.reduce(
        (sum, row) => sum + Number(row.sold_supply_sum ?? 0),
        0,
      ),
      average_margin:
        rows.length > 0
          ? rows.reduce((sum, row) => sum + Number(row.average_margin ?? 0), 0) /
            rows.length
          : 0,
      discount:
        rows.length > 0
          ? rows.reduce((sum, row) => sum + Number(row.discount ?? 0), 0) /
            rows.length
          : 0,
      sold_with_discount: rows.reduce(
        (sum, row) => sum + Number(row.sold_with_discount ?? 0),
        0,
      ),
      sold_without_discount: rows.reduce(
        (sum, row) => sum + Number(row.sold_without_discount ?? 0),
        0,
      ),
      left_start_date: 0,
      left_start_date_supply_price: 0,
      left_start_date_retail_price: 0,
      left_end_date: 0,
      left_end_date_supply_price: 0,
      left_end_date_retail_price: 0,
    };
  }

  private async buildProductPerformanceRowsApi(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const products = await this.loadReportProducts(query, context);
    const sales = await this.loadReportSales(query, context);
    const movements = await this.loadProductMovements(query, context);
    const shops = await this.loadReportShops(context, query);
    const shopByBranchCode = new Map<string, any>(
      shops.map((shop) => [shop.branchCode, shop] as const),
    );
    const soldMap = new Map<string, number>();

    for (const row of this.flattenSaleItems(sales)) {
      const key = `${row.branchCode}__${row.product?.id ?? row.item.productId ?? ''}`;
      soldMap.set(key, (soldMap.get(key) ?? 0) + Number(row.sold_measurement_value ?? 0));
    }

    const importsByKey = new Map<string, number>();
    const writeOffsByKey = new Map<string, number>();
    for (const movement of movements) {
      const key = `${movement.shop?.branchCode ?? movement.shop?.id ?? ''}__${movement.productId ?? ''}`;
      if (movement.type === 'PURCHASE') {
        importsByKey.set(key, (importsByKey.get(key) ?? 0) + Math.abs(Number(movement.quantity ?? 0)));
      }
      if (movement.type === 'WRITE_OFF') {
        writeOffsByKey.set(key, (writeOffsByKey.get(key) ?? 0) + Math.abs(Number(movement.quantity ?? 0)));
      }
    }

    return products.flatMap((product: any) => {
      const stocks = Array.isArray(product.stocks) && product.stocks.length
        ? product.stocks
        : [{ branchCode: '', quantity: product.quantity ?? 0 }];
      return stocks.map((stock: any) => {
        const branchCode = stock.branchCode ?? '';
        const shop = shopByBranchCode.get(branchCode);
        const key = `${branchCode}__${product.id}`;
        const supplyPrice = Number(stock.purchasePrice ?? product.purchasePrice ?? 0);
        const retailPrice = Number(stock.salePrice ?? product.salePrice ?? 0);
        const stockEnd = Number(stock.quantity ?? 0);
        const importAmount = importsByKey.get(key) ?? 0;
        const soldAmount = soldMap.get(key) ?? 0;
        const writeOffAmount = writeOffsByKey.get(key) ?? 0;
        const stockBegin = stockEnd + soldAmount + writeOffAmount - importAmount;
        const supplier = product?.suppliers?.[0]?.supplier;

        return {
          rep_date: '0001-01-01T00:00:00Z',
          company_id: context?.companyId ?? '',
          shop_id: shop?.id ?? '',
          shop_name: shop?.name ?? branchCode,
          product_id: product.publicId ?? product.id ?? '',
          product_type_id: '',
          brand_id: JSON.stringify(product?.brand?.id ?? ''),
          brand_name: product?.brand?.name ?? '',
          name: product.name,
          sku: product.sku ?? '',
          bar_code: product.barcode ?? '',
          properties: null,
          is_variative: 0,
          measurement_value: 0,
          measurement_unit_id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
          measurement_unit_name: 'Штука',
          measurement_unit_short_name: 'шт',
          retail_price: 0,
          retail_currency: '',
          supply_price: 0,
          supply_currency: '',
          category: product?.category ? [product.category] : [],
          categories_path: product?.category?.name ? [product.category.name] : [],
          level_1: product?.category?.name ? [product.category.name] : [],
          level_2: [],
          level_3: [],
          level_4: [],
          level_5: [],
          attributes: null,
          custom_fields: [],
          is_archived: Boolean(product?.archivedAt),
          group_category: '',
          group_custom_field: {
            custom_field_name: '',
            custom_field_id: '',
            custom_field_value: '',
          },
          group_attribute: {
            id: '',
            attribute_id: '',
            attribute_name: '',
            attribute_value_id: '',
            sequence_number: 0,
            name: '',
          },
          supplier_id: supplier?.id ?? '00000000-0000-0000-0000-000000000000',
          supplier_name: supplier?.name ?? '',
          stock_amount_begin: stockBegin,
          stock_supply_begin: 0,
          stock_retail_begin: 0,
          stock_supply_sum_begin: stockBegin * supplyPrice,
          stock_retail_sum_begin: stockBegin * retailPrice,
          stock_amount_end: stockEnd,
          stock_supply_end: 0,
          stock_retail_end: 0,
          stock_supply_sum_end: stockEnd * supplyPrice,
          stock_retail_sum_end: stockEnd * retailPrice,
          import_amount: importAmount,
          import_supply_price: 0,
          import_retail_price: 0,
          import_supply_sum: importAmount * supplyPrice,
          import_retail_sum: importAmount * retailPrice,
          order_amount: 0,
          order_supply_price: 0,
          order_retail_price: 0,
          order_supply_sum: 0,
          order_retail_sum: 0,
          inc_transfer_amount: 0,
          inc_transfer_supply_price: 0,
          inc_transfer_retail_price: 0,
          inc_transfer_supply_sum: 0,
          inc_transfer_retail_sum: 0,
          out_transfer_amount: 0,
          out_transfer_supply_price: 0,
          out_transfer_retail_price: 0,
          out_transfer_supply_sum: 0,
          out_transfer_retail_sum: 0,
          sold_amount: soldAmount,
          sold_supply_price: 0,
          sold_retail_price: 0,
          sold_sales_price: 0,
          sold_supply_sum: soldAmount * supplyPrice,
          sold_retail_sum: soldAmount * retailPrice,
          sold_sales_sum: 0,
          returned_amount: 0,
          returned_supply_price: 0,
          returned_retail_price: 0,
          returned_sales_price: 0,
          returned_supply_sum: 0,
          returned_retail_sum: 0,
          returned_sales_sum: 0,
          write_off_amount: writeOffAmount,
          write_off_supply_price: 0,
          write_off_retail_price: 0,
          write_off_supply_sum: writeOffAmount * supplyPrice,
          write_off_retail_sum: writeOffAmount * retailPrice,
          repricing_amount: 0,
          repricing_supply_sum: 0,
          repricing_retail_sum: 0,
          supplier_order_return_amount: 0,
          supplier_order_return_supply_sum: 0,
          supplier_order_return_retail_sum: 0,
          qty_sellout: soldAmount,
          sum_sellout: 0,
          day_difference: 1,
          sellout_in_number: 0,
          sellout_by_days: 0,
        };
      });
    });
  }

  private async buildImportReportRows(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const movements = await this.loadProductMovements(
      { ...query, movementType: 'PURCHASE' },
      context,
    );
    const purchaseMovements = movements.filter((movement: any) => movement.type === 'PURCHASE');
    return purchaseMovements.map((item: any) => {
      const quantity = Math.abs(Number(item.quantity ?? 0));
      const supplyPrice = Number(item.product?.purchasePrice ?? 0);
      const retailPrice = Number(item.product?.salePrice ?? 0);
      const leftQty = Math.max(0, this.resolveStockLeft(item.product));
      const soldQty = Math.max(0, quantity - leftQty);
      const supplier = item.product?.suppliers?.[0]?.supplier;
      return {
        shop_id: item.shopId ?? '',
        shop_name: item.shop?.name ?? '',
        external_import_id: item.externalId ?? item.id ?? 0,
        external_supplier_order_id: 0,
        import_name: item.externalId ? `Product Import ${item.externalId}` : `Product Import ${item.id}`,
        supplier_name: supplier?.name ?? '',
        import_type: 'import',
        is_import: false,
        is_supplier_order: false,
        type: '',
        date: this.formatDateTime(item.createdAt, item.companyId),
        imported_qty: quantity,
        imported_retail_sum: quantity * retailPrice,
        imported_supply_sum: quantity * supplyPrice,
        supplier_order_qty: 0,
        supplier_order_retail_sum: 0,
        supplier_order_supply_sum: 0,
        sold_qty: soldQty,
        sold_retail_sum: soldQty * retailPrice,
        sold_supply_sum: soldQty * supplyPrice,
        sold_sale_sum: soldQty * retailPrice,
        written_off_qty: 0,
        written_off_retail_sum: 0,
        written_off_supply_sum: 0,
        left_qty: Math.max(0, quantity - soldQty),
        left_retail_sum: Math.max(0, quantity - soldQty) * retailPrice,
        left_supply_sum: Math.max(0, quantity - soldQty) * supplyPrice,
        transfer_arrived_qty: 0,
        transfer_arrived_retail_price: 0,
        transfer_arrived_supply_sum: 0,
        transfer_finished_qty: 0,
        transfer_finished_retail_sum: 0,
        transfer_finished_supply_sum: 0,
        returned: 0,
        returned_retail_sum: 0,
        returned_supply_sum: 0,
        returned_sale_sum: 0,
        repricing_qty: 0,
        repricing_retail_sum: 0,
        repricing_supply_sum: 0,
        return_supplier_order_qty: 0,
        return_supplier_order_retail_sum: 0,
        return_supplier_order_supply_sum: 0,
        outcome: 0,
        product_id: item.product?.publicId ?? item.productId ?? '',
        import_id: String(item.id ?? ''),
        supplier_order_id: '',
        product_name: item.product?.name ?? '',
        product_base_name: '',
        product_sku: item.product?.sku ?? '',
        product_barcode: item.product?.barcode ?? '',
        is_archived: Boolean(item.product?.archivedAt),
        product_brand_id: JSON.stringify(item.product?.brand?.id ?? ''),
        product_brand_name: item.product?.brand?.name ?? '',
        product_categories: item.product?.category ? [item.product.category] : null,
        categories_path: item.product?.category?.name ? [item.product.category.name] : [],
        level_1: item.product?.category?.name ? [item.product.category.name] : [],
        level_2: [],
        level_3: [],
        level_4: [],
        level_5: [],
        product_measurement_unit_id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
        product_measurement_unit_name: 'Штука',
        product_measurement_unit_short_name: 'шт',
        product_attributes: [],
        product_custom_fields: [],
      };
    });
  }

  private buildSupplierSalesRows(
    sales: any[],
    query: Record<string, string | undefined>,
  ) {
    const grouped = new Map<string, any>();
    for (const row of this.flattenSaleItems(sales)) {
      const supplier = row.product?.suppliers?.[0]?.supplier;
      const day = this.toPlotDate(row.date);
      const key = `${day}__${row.branchCode}__${supplier?.id ?? 'unknown'}__${row.product?.id ?? row.item.productId ?? row.item.name}`;
      const existing = grouped.get(key) ?? {
        date: day,
        shop_id: '',
        shop_name: row.branchCode,
        product_id: row.product?.publicId ?? row.product?.id ?? '',
        order_number: '',
        product_name: row.item.name,
        product_base_name: '',
        product_sku: row.item.sku ?? row.product?.sku ?? '',
        product_barcode: row.item.barcode ?? row.product?.barcode ?? '',
        product_brand_id: JSON.stringify(row.product?.brand?.id ?? ''),
        product_brand_name: row.product?.brand?.name ?? '',
        free_price: false,
        used_wholesale_price: false,
        supplier_id: supplier?.id ?? '00000000-0000-0000-0000-000000000000',
        supplier_external_id: 0,
        product_categories: row.product?.category ? [row.product.category] : [],
        categories_path: row.product?.category?.name ? [row.product.category.name] : [],
        level_1: row.product?.category?.name ? [row.product.category.name] : [],
        level_2: [],
        level_3: [],
        level_4: [],
        level_5: [],
        product_measurement_unit_id: '12a69bc0-c575-4586-9f0f-76e8295d4139',
        product_measurement_unit_name: 'Штука',
        product_measurement_unit_short_name: 'шт',
        product_attributes: [],
        product_is_archived: Boolean(row.product?.archivedAt),
        product_suppliers: supplier?.name ?? '',
        customer_full_name: row.sale?.clientName ?? '',
        customer_phone_number: '',
        seller_full_name: this.buildUserName(row.item?.seller ?? row.sale?.user),
        cashier_full_name: this.buildUserName(row.sale?.user),
        transaction_type: row.sale?.saleType ?? '',
        order_id: String(row.sale?.id ?? ''),
        movement_id: '',
        sold_measurement_value: 0,
        returned_measurement_value: 0,
        net_sold_measurement_value: 0,
        gross_sales: 0,
        returned_sales_sum: 0,
        net_sales: 0,
        net_profit: 0,
        sold_supply_sum: 0,
        average_margin: 0,
        discount: 0,
        sold_with_discount: 0,
        sold_without_discount: 0,
        left_start_date: 0,
        left_start_date_supply_price: 0,
        left_start_date_retail_price: 0,
        left_end_date: 0,
        left_end_date_supply_price: 0,
        left_end_date_retail_price: 0,
        custom_fields: [],
        _count: 0,
      };
      existing.sold_measurement_value += row.sold_measurement_value;
      existing.returned_measurement_value += row.returned_measurement_value;
      existing.net_sold_measurement_value += row.net_sold_measurement_value;
      existing.gross_sales += row.gross_sales;
      existing.returned_sales_sum += row.returned_sales_sum;
      existing.net_sales += row.net_sales;
      existing.net_profit += row.net_profit;
      existing.sold_supply_sum += row.sold_supply_sum;
      existing.average_margin += row.average_margin;
      existing.discount += row.discount;
      existing.sold_with_discount += row.sold_with_discount;
      existing.sold_without_discount += row.sold_without_discount;
      existing._count += 1;
      grouped.set(key, existing);
    }

    return [...grouped.values()].map((row) => ({
      ...row,
      average_margin: row._count > 0 ? row.average_margin / row._count : 0,
      discount: row._count > 0 ? row.discount / row._count : 0,
    }));
  }

  private async buildStockReportRows(
    query: Record<string, string | undefined>,
    context: any,
  ) {
    const products = await this.loadReportProducts(query, context);
    const shops = await this.loadReportShops(context, query);
    const shopByBranchCode = new Map<string, any>(
      shops.map((shop) => [shop.branchCode, shop] as const),
    );
    const requestedBranchCodes = await this.resolveShopBranchCodesFromQuery(
      query,
      context,
      ['shop_ids', 'shopId', 'shop_id'],
    );

    return products.flatMap((product: any) => {
      const stocks = Array.isArray(product.stocks) && product.stocks.length
        ? product.stocks
        : [
            {
              branchCode: '',
              quantity: product.quantity ?? 0,
              purchasePrice: product.purchasePrice,
              salePrice: product.salePrice,
              createdAt: product.createdAt,
            },
          ];

      return stocks
        .filter((stock: any) =>
          !requestedBranchCodes.length ||
          requestedBranchCodes.includes(stock.branchCode ?? ''),
        )
        .map((stock: any) => {
          const shop = shopByBranchCode.get(stock.branchCode ?? '');
          const quantity = Number(stock.quantity ?? 0);
          const supplyPrice = Number(stock.purchasePrice ?? product.purchasePrice ?? 0);
          const retailPrice = Number(stock.salePrice ?? product.salePrice ?? 0);
          const estimatedIncome = quantity * Math.max(0, retailPrice - supplyPrice);
          const estimatedMargin =
            retailPrice > 0 ? Math.round(((retailPrice - supplyPrice) / retailPrice) * 100) : 0;
          return {
            shop_id: shop?.id ?? '',
            shop_name: shop?.name ?? stock.branchCode ?? '',
            product_id: product.publicId ?? product.id ?? '',
            supplier_id:
              product?.suppliers?.[0]?.supplier?.id ??
              '00000000-0000-0000-0000-000000000000',
            supplier_name: product?.suppliers?.[0]?.supplier?.name ?? '',
            supply_price: supplyPrice,
            retail_price: retailPrice,
            measurement_value: quantity,
            last_import: this.formatDateTime(
              product.updatedAt ?? product.createdAt ?? new Date(),
              product.companyId,
            ),
            estimated_income: estimatedIncome,
            estimated_margin: estimatedMargin,
            rows_count: 0,
            product_name: product.name,
            product_base_name: '',
            product_barcode: product.barcode ?? '',
            product_brand_name: product?.brand?.name ?? '',
            product_categories: product?.category ? [product.category] : [],
            categories_path: product?.category?.name ? [product.category.name] : [],
            level_1: product?.category?.name ? [product.category.name] : [],
            level_2: [],
            level_3: [],
            level_4: [],
            level_5: [],
            product_sku: product.sku ?? '',
            product_attributes: [],
            product_custom_fields: [],
            product_measurement_unit_short_name: 'шт',
            product_is_archived: Boolean(product.archivedAt),
          };
        });
    }).map((row, index, allRows) => ({
      ...row,
      rows_count: allRows.length,
    }));
  }

  private buildProductBreakdown(items: any[]) {
    return {
      categories: this.groupProductMetric(items, 'category', 'net_gross_sales'),
      brands: this.groupProductMetric(items, 'brand', 'net_gross_sales'),
      colors: this.groupProductMetric(items, 'color', 'sold_quantity'),
      sizes: this.groupProductMetric(items, 'size', 'sold_quantity'),
      characteristics: this.groupCharacteristics(items),
    };
  }

  private groupProductMetric(items: any[], key: string, metricKey: string) {
    const grouped = new Map<string, number>();
    for (const item of items) {
      const groupKey = this.optionalString(item[key]) ?? 'Без значения';
      grouped.set(groupKey, (grouped.get(groupKey) ?? 0) + Number(item[metricKey] ?? 0));
    }
    return [...grouped.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  private groupCharacteristics(items: any[]) {
    const grouped = new Map<string, number>();
    for (const item of items) {
      const characteristics = Array.isArray(item.characteristics)
        ? item.characteristics
        : [];
      for (const characteristic of characteristics) {
        const key = this.optionalString(characteristic) ?? 'Без значения';
        grouped.set(key, (grouped.get(key) ?? 0) + Number(item.sold_quantity ?? 0));
      }
    }
    return [...grouped.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }

  private buildProductEffectiveness(products: any[], sales: any[], movements: any[]) {
    const soldByProduct = new Map<number, number>();
    const returnedByProduct = new Map<number, number>();

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        if (!item.productId) {
          continue;
        }
        if (sign < 0) {
          returnedByProduct.set(
            item.productId,
            (returnedByProduct.get(item.productId) ?? 0) + Number(item.quantity),
          );
        } else {
          soldByProduct.set(
            item.productId,
            (soldByProduct.get(item.productId) ?? 0) + Number(item.quantity),
          );
        }
      }
    }

    const importsByProduct = this.sumMovementsByProduct(movements, 'PURCHASE');
    const writeOffsByProduct = this.sumMovementsByProduct(movements, 'WRITE_OFF');
    const transfersByProduct = this.sumMovementsByProduct(movements, 'TRANSFER');

    return products.map((product: any) => {
      const endingStock = this.resolveStockLeft(product);
      const soldQuantity = soldByProduct.get(product.id) ?? 0;
      const returnedQuantity = returnedByProduct.get(product.id) ?? 0;
      const importQuantity = importsByProduct.get(product.id) ?? 0;
      const writeOffQuantity = writeOffsByProduct.get(product.id) ?? 0;
      const transferQuantity = transfersByProduct.get(product.id) ?? 0;
      const startStock =
        endingStock -
        importQuantity -
        returnedQuantity +
        soldQuantity +
        writeOffQuantity +
        transferQuantity;
      const averageStock = (startStock + endingStock) / 2;

      return {
        product_id: product.id,
        product_name: product.name,
        sku: product.sku ?? '',
        start_stock: startStock,
        imports_quantity: importQuantity,
        sold_quantity: soldQuantity,
        returned_quantity: returnedQuantity,
        write_off_quantity: writeOffQuantity,
        transfer_quantity: transferQuantity,
        ending_stock: endingStock,
        stock_cost: endingStock * Number(product.purchasePrice ?? 0),
        stock_retail_value: endingStock * Number(product.salePrice ?? 0),
        inventory_turnover:
          averageStock > 0 ? soldQuantity / averageStock : 0,
        days_storage:
          soldQuantity > 0 && averageStock > 0 ? (averageStock / soldQuantity) * 30 : 0,
      };
    });
  }

  private aggregateSuppliers(sales: any[]) {
    const suppliers = new Map<string, any>();

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        const supplier = item.product?.suppliers?.[0]?.supplier;
        const supplierKey = supplier ? String(supplier.id) : 'unknown';
        const existing = suppliers.get(supplierKey) ?? {
          supplier_id: supplier?.id ?? null,
          supplier_name: supplier?.name ?? 'Без поставщика',
          products_count: new Set<number>(),
          sold_quantity: 0,
          gross_sales: 0,
          net_gross_sales: 0,
          gross_profit: 0,
          average_markup_sum: 0,
          average_markup_count: 0,
          returns: 0,
          stock_left: 0,
        };
        if (item.productId) {
          const sizeBefore = existing.products_count.size;
          existing.products_count.add(item.productId);
          if (existing.products_count.size > sizeBefore) {
            existing.stock_left += this.resolveStockLeft(item.product);
          }
        }
        existing.sold_quantity += item.quantity * sign;
        existing.gross_sales += this.getItemRetailPrice(item) * sign;
        existing.net_gross_sales += this.getItemFinalPrice(item) * sign;
        existing.gross_profit += this.getItemProfit(item) * sign;
        existing.average_markup_sum +=
          item.markupAtSale !== undefined && item.markupAtSale !== null
            ? Number(item.markupAtSale)
            : this.getItemSupplyPrice(item) > 0
              ? this.getItemFinalPrice(item) / this.getItemSupplyPrice(item)
              : 0;
        existing.average_markup_count += 1;
        if (sale.saleType === 'return') {
          existing.returns += Number(item.quantity);
        }
        suppliers.set(supplierKey, existing);
      }
    }

    return [...suppliers.values()].map((item) => ({
      supplier_id: item.supplier_id,
      supplier_name: item.supplier_name,
      products_count: item.products_count.size,
      sold_quantity: item.sold_quantity,
      gross_sales: item.gross_sales,
      net_gross_sales: item.net_gross_sales,
      gross_profit: item.gross_profit,
      average_markup:
        item.average_markup_count > 0
          ? item.average_markup_sum / item.average_markup_count
          : 0,
      returns: item.returns,
      stock_left: item.stock_left,
    }));
  }

  private buildProductStocks(
    products: any[],
    query: Record<string, string | undefined>,
  ) {
    return products.flatMap((product: any) => {
      const stocks = Array.isArray(product.stocks) && product.stocks.length
        ? product.stocks
        : [
            {
              branchCode: '',
              quantity: product.quantity ?? 0,
              purchasePrice: product.purchasePrice,
              salePrice: product.salePrice,
            },
          ];

      return stocks.map((stock: any) => {
          const quantity = Number(stock.quantity ?? 0);
          const supplyPrice = Number(stock.purchasePrice ?? product.purchasePrice ?? 0);
          const retailPrice = Number(stock.salePrice ?? product.salePrice ?? 0);
          return {
            product_id: product.id,
            product_name: product.name,
            sku: product.sku ?? '',
            category: product.category?.name ?? '',
            shop_name: stock.branchCode ?? '',
            stock_quantity: quantity,
            supply_price: supplyPrice,
            retail_price: retailPrice,
            stock_supply_total: quantity * supplyPrice,
            stock_retail_total: quantity * retailPrice,
            potential_profit: quantity * (retailPrice - supplyPrice),
          };
        });
    });
  }

  private sumMovementsByProduct(movements: any[], type: string) {
    const grouped = new Map<number, number>();
    for (const item of movements.filter((movement) => movement.type === type)) {
      grouped.set(
        item.productId,
        (grouped.get(item.productId) ?? 0) + Math.abs(this.toNumber(item.quantity) ?? 0),
      );
    }
    return grouped;
  }

  private async aggregateSellers(sales: any[]) {
    const sellers = this.aggregateSellersFromSales(sales);
    return Promise.all(
      sellers.map(async (seller) => {
        const settings = await this.getOrCreateSalarySettings(seller.seller_id);
        const summary = this.buildSummaryMetrics(seller._sales);
        const bonusAmount = seller._sales
          .flatMap((sale: any) => sale.items)
          .filter((item: any) => (item.sellerId ?? seller.seller_id) === seller.seller_id)
          .reduce((sum: number, item: any) => sum + this.getItemBonus(item, settings), 0);

        return {
          seller_id: seller.seller_id,
          seller_name: seller.seller_name,
          shop_name: seller.shop_name,
          gross_sales: summary.gross_sales,
          net_gross_sales: summary.net_gross_sales,
          gross_profit: summary.gross_profit,
          products_sold: summary.products_sold,
          transactions_count: summary.transactions_count,
          average_cheque: summary.average_cheque,
          discount_sum: summary.discount_sum,
          discount_percent: summary.discount_percent,
          returns: summary.returns_count,
          average_extra_charge: summary.average_extra_charge,
          kpi_score: this.calculateKpiScore(summary, queryTargetUndefined()),
          fixed_salary: settings.fixedSalary,
          salary_percent: settings.salaryPercent,
          bonus: bonusAmount,
          salary_total: this.calculateSalaryTotal(settings, summary, bonusAmount),
        };
      }),
    );
  }

  private aggregateSellersFromSales(sales: any[]) {
    const sellers = new Map<number, any>();

    for (const sale of sales) {
      const sellerId = sale.user?.id;
      if (!sellerId) {
        continue;
      }
      const existing = sellers.get(sellerId) ?? {
        seller_id: sellerId,
        seller_name: `${sale.user.firstName} ${sale.user.lastName}`.trim(),
        shop_name: sale.branchCode ?? '',
        _sales: [],
      };
      existing._sales.push(sale);
      sellers.set(sellerId, existing);
    }

    return [...sellers.values()];
  }

  private groupSalesByDay(sales: any[]) {
    const byDay = new Map<string, number>();
    for (const sale of sales) {
      const key = this.formatDate(sale.paidAt ?? sale.createdAt, sale.companyId);
      byDay.set(key, (byDay.get(key) ?? 0) + this.getSaleNetAmount(sale));
    }
    return [...byDay.entries()].map(([date, amount]) => ({ date, amount }));
  }

  private groupProfitByDay(sales: any[]) {
    const byDay = new Map<string, number>();
    for (const sale of sales) {
      const key = this.formatDate(sale.paidAt ?? sale.createdAt, sale.companyId);
      const profit = sale.items.reduce(
        (sum: number, item: any) => sum + this.getItemProfit(item) * this.getSaleSign(sale),
        0,
      );
      byDay.set(key, (byDay.get(key) ?? 0) + profit);
    }
    return [...byDay.entries()].map(([date, amount]) => ({ date, amount }));
  }

  private async getOrCreateSalarySettings(userId: number) {
    return this.db.sellerSalarySettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
      },
    });
  }

  private toSalarySettingsResponse(settings: any, seller: any) {
    return {
      seller_id: String(seller.id),
      seller_name: `${seller.firstName} ${seller.lastName}`.trim(),
      fixedSalary: settings.fixedSalary,
      salaryPercent: settings.salaryPercent,
      calculationType: settings.calculationType,
      bonusEnabled: settings.bonusEnabled,
      isActive: settings.isActive,
    };
  }

  private calculateSalaryTotal(
    settings: any,
    summary: {
      net_gross_sales: number;
      gross_profit: number;
    },
    bonusAmount: number,
  ) {
    const fixed = Number(settings.fixedSalary ?? 0);
    const percent = Number(settings.salaryPercent ?? 0);
    switch (settings.calculationType) {
      case 'FIXED_ONLY':
        return fixed;
      case 'PROFIT_PERCENT_ONLY':
        return (summary.gross_profit * percent) / 100;
      case 'REVENUE_PERCENT_ONLY':
        return (summary.net_gross_sales * percent) / 100;
      case 'FIXED_PLUS_REVENUE':
        return fixed + (summary.net_gross_sales * percent) / 100;
      case 'FIXED_PLUS_PROFIT':
      default:
        return fixed + bonusAmount;
    }
  }

  private async assertSellerVisibility(
    sellerId: number,
    context: any,
    authorization?: string,
  ) {
    if (context?.userId === sellerId) {
      return;
    }
    await this.usersService.assertAdminAccess(authorization);
  }

  private getSaleSign(sale: any) {
    return sale.saleType === 'return' ? -1 : 1;
  }

  private getSaleNetAmount(sale: any) {
    return sale.items.reduce(
      (sum: number, item: any) => sum + this.getItemFinalPrice(item),
      0,
    ) * this.getSaleSign(sale);
  }

  private getItemRetailPrice(item: any) {
    return Number(
      item.retailPriceAtSale ?? item.lineTotal ?? ((item.salePrice ?? 0) * (item.quantity ?? 0)),
    );
  }

  private getItemDiscount(item: any) {
    return Number(item.discountAmount ?? 0);
  }

  private getItemFinalPrice(item: any) {
    return Number(
      item.finalPrice ?? item.lineTotal ?? ((item.salePrice ?? 0) * (item.quantity ?? 0)),
    );
  }

  private getItemSupplyPrice(item: any) {
    return Number(
      item.supplyPriceAtSale ??
        ((item.product?.purchasePrice ?? 0) * (item.quantity ?? 0)),
    );
  }

  private getItemProfit(item: any) {
    return Number(
      item.profitAtSale ??
        (this.getItemFinalPrice(item) - this.getItemSupplyPrice(item)),
    );
  }

  private getItemBonus(item: any, settings?: any) {
    if (item.sellerBonusAmount !== undefined && item.sellerBonusAmount !== null) {
      return Number(item.sellerBonusAmount);
    }

    if (!settings || settings.bonusEnabled === false) {
      return 0;
    }

    const percent = Number(settings.salaryPercent ?? 0);
    if (
      settings.calculationType === 'REVENUE_PERCENT_ONLY' ||
      settings.calculationType === 'FIXED_PLUS_REVENUE'
    ) {
      return (this.getItemFinalPrice(item) * percent) / 100;
    }

    if (
      settings.calculationType === 'PROFIT_PERCENT_ONLY' ||
      settings.calculationType === 'FIXED_PLUS_PROFIT'
    ) {
      return (this.getItemProfit(item) * percent) / 100;
    }

    return 0;
  }

  private resolveStockLeft(product: any) {
    if (!product?.stocks?.length) {
      return product?.quantity ?? 0;
    }

    return product.stocks.reduce(
      (sum: number, stock: any) => sum + (stock.quantity ?? 0),
      0,
    );
  }

  private resolveCustomerStatus(
    purchasesCount: number,
    totalAmount: number,
    lastPurchase: Date,
  ) {
    const now = Date.now();
    const lastPurchaseTime = new Date(lastPurchase).getTime();
    const diffDays = Math.floor((now - lastPurchaseTime) / 86400000);

    if (diffDays > 120) {
      return 'Потерянный';
    }
    if (diffDays > 60) {
      return 'Спящий';
    }
    if (purchasesCount >= 10 || totalAmount >= 5000000) {
      return 'VIP';
    }
    if (purchasesCount >= 3) {
      return 'Постоянный';
    }
    return 'Новый';
  }

  private calculateKpiScore(
    summary: { net_gross_sales: number },
    target?: number,
  ) {
    if (!summary.net_gross_sales) {
      return 0;
    }
    if (!target || target <= 0) {
      return Math.min(100, Math.round(summary.net_gross_sales > 0 ? 100 : 0));
    }
    return Math.min(100, Math.round((summary.net_gross_sales / target) * 100));
  }

  private toGeneralReportMetrics(
    summary: any,
    shop?: { id: string; name: string },
    options?: { roundAverageMeasurementValue?: number },
  ) {
    const averageMeasurementValue =
      Number(summary.transactions_count ?? 0) > 0
        ? Number(summary.products_sold ?? 0) / Number(summary.transactions_count ?? 0)
        : 0;
    const salesSupplyPrice = Math.max(
      0,
      Number(summary.gross_sales ?? 0) -
        Number(summary.net_gross_sales ?? 0) -
        Number(summary.discount_sum ?? 0) +
        Number(summary.gross_profit ?? 0),
    );

    return {
      ...(shop
        ? {
            shop_id: shop.id,
            shop_name: shop.name,
          }
        : {}),
      gross_sales: this.roundMetric(summary.gross_sales, 2),
      discount_sum: this.roundMetric(summary.discount_sum, 2),
      discount_percent: this.roundMetric(summary.discount_percent, 2),
      products_returned: 0,
      products_exchanged: 0,
      returned_supply_price: 0,
      returned_discount_price: 0,
      returned_retail_price: 0,
      sales_supply_price: this.roundMetric(salesSupplyPrice, 2),
      net_gross_sales: this.roundMetric(summary.net_gross_sales, 2),
      gross_profit: this.roundMetric(summary.gross_profit, 2),
      average_cheque: this.roundMetric(summary.average_cheque, 2),
      average_price: this.roundMetric(
        Number(summary.products_sold ?? 0) > 0
          ? Number(summary.net_gross_sales ?? 0) / Number(summary.products_sold ?? 0)
          : 0,
        2,
      ),
      sales: 0,
      average_measurement_value: this.roundMetric(
        averageMeasurementValue,
        options?.roundAverageMeasurementValue ?? 2,
      ),
      average_discount: 0,
      average_extra_charge: this.roundMetric(summary.average_extra_charge, 2),
      products_sold: this.roundMetric(summary.products_sold, 2),
      imported_measurement_value: 0,
      imported_retail_price: 0,
      imported_supply_price: 0,
      transactions_count: this.roundMetric(summary.transactions_count, 2),
      orders_count: this.roundMetric(summary.transactions_count, 2),
      returns_count: this.roundMetric(summary.returns_count, 2),
      exchanges_count: this.roundMetric(summary.exchanges_count, 2),
      sales_per_square: 0,
      left_products_start_date: 0,
      left_products_supply_price_start_date: 0,
      left_products_retail_price_start_date: 0,
      left_products_end_date: 0,
      left_products_supply_price_end_date: 0,
      left_products_retail_price_end_date: 0,
    };
  }

  private resolveGeneralSalesField(summary: any, field: string) {
    switch (field) {
      case 'net_gross_sales':
        return Number(summary.net_gross_sales ?? 0);
      case 'gross_profit':
        return Number(summary.gross_profit ?? 0);
      case 'discount_sum':
        return Number(summary.discount_sum ?? 0);
      case 'transactions_count':
        return Number(summary.transactions_count ?? 0);
      case 'products_sold':
        return Number(summary.products_sold ?? 0);
      case 'gross_sales':
      default:
        return Number(summary.gross_sales ?? 0);
    }
  }

  private calculateProductMetric(sales: any[], field: string) {
    let value = 0;

    for (const sale of sales) {
      const sign = this.getSaleSign(sale);
      for (const item of sale.items) {
        if (sign < 0) {
          continue;
        }
        if (field === 'sold_with_discount') {
          value += this.getItemDiscount(item) > 0 ? Number(item.quantity ?? 0) : 0;
          continue;
        }
        if (field === 'sold_qty') {
          value += Number(item.quantity ?? 0);
          continue;
        }
        value += this.getItemFinalPrice(item);
      }
    }

    return value;
  }

  private resolveProductRankingValue(
    item: any,
    query: Record<string, string | undefined>,
  ) {
    const field = this.optionalString(query.top_product_field) ?? 'sold_qty';
    switch (field) {
      case 'gross_profit':
        return this.getItemProfit(item);
      case 'net_gross_sales':
        return this.getItemFinalPrice(item);
      case 'sold_qty':
      default:
        return Number(item.quantity ?? 0);
    }
  }

  private resolveCategoryRankingValue(
    item: any,
    query: Record<string, string | undefined>,
  ) {
    const field = this.optionalString(query.top_category_field) ?? 'sold_qty';
    switch (field) {
      case 'gross_profit':
        return this.getItemProfit(item);
      case 'net_gross_sales':
        return this.getItemFinalPrice(item);
      case 'sold_qty':
      default:
        return Number(item.quantity ?? 0);
    }
  }

  private buildGeneralShopPlot(
    sales: any[],
    shops: any[],
    valueResolver: (sales: any[], day: string, shop: any) => number,
  ) {
    const dayMap = new Map<string, Record<string, number>>();

    for (const sale of sales) {
      const day = this.toPlotDate(sale.paidAt ?? sale.createdAt);
      const bucket = dayMap.get(day) ?? {};
      dayMap.set(day, bucket);
    }

    if (!dayMap.size) {
      const startDate = this.toPlotDate(this.parseDate(undefined) ?? new Date());
      const empty: Record<string, number | string> = {
        start_date: startDate,
      };
      for (const shop of shops) {
        empty[shop.name] = 0;
      }
      return [empty];
    }

    return [...dayMap.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((day) => {
        const row: Record<string, number | string> = {
          start_date: day,
        };
        for (const shop of shops) {
          row[shop.name] = valueResolver(
            sales.filter((sale: any) => {
              const saleDay = this.toPlotDate(sale.paidAt ?? sale.createdAt);
              return saleDay === day && sale.branchCode === shop.branchCode;
            }),
            day,
            shop,
          );
        }
        return row;
      });
  }

  private buildCustomerReportKey(sale: {
    clientId?: string | null;
    clientName?: string | null;
  }) {
    if (sale.clientId?.trim()) {
      return `id:${sale.clientId.trim()}`;
    }

    if (sale.clientName?.trim()) {
      return `name:${sale.clientName.trim().toLowerCase()}`;
    }

    return '';
  }

  private resolveCustomerReportName(sale: {
    clientName?: string | null;
    clientId?: string | null;
  }) {
    return sale.clientName?.trim() || sale.clientId?.trim() || '';
  }

  private async loadCustomerFirstPurchaseDates(sales: any[], context: any) {
    const firstPurchaseByCustomer = new Map<string, Date>();
    const clientIds = [...new Set(
      sales
        .map((sale) => this.optionalString(sale.clientId))
        .filter((value): value is string => Boolean(value)),
    )];

    if (clientIds.length) {
      const historicalSales = await this.db.sale.findMany({
        where: {
          clientId: { in: clientIds },
          status: {
            in: ['paid', 'returned'],
          },
          ...(context?.companyId ? { companyId: context.companyId } : {}),
          ...(context?.allowedBranchCodes?.length
            ? { branchCode: { in: context.allowedBranchCodes } }
            : {}),
          NOT: {
            saleType: 'return',
          },
        },
        select: {
          clientId: true,
          paidAt: true,
          createdAt: true,
        },
        orderBy: {
          paidAt: 'asc',
        },
      });

      for (const sale of historicalSales) {
        const clientId = this.optionalString(sale.clientId);
        if (!clientId) {
          continue;
        }

        const customerKey = `id:${clientId}`;
        const purchaseDate = sale.paidAt ?? sale.createdAt;
        const existing = firstPurchaseByCustomer.get(customerKey);

        if (!existing || purchaseDate.getTime() < existing.getTime()) {
          firstPurchaseByCustomer.set(customerKey, purchaseDate);
        }
      }
    }

    for (const sale of sales) {
      const customerKey = this.buildCustomerReportKey(sale);
      if (!customerKey) {
        continue;
      }

      const purchaseDate = sale.paidAt ?? sale.createdAt;
      const existing = firstPurchaseByCustomer.get(customerKey);

      if (!existing || purchaseDate.getTime() < existing.getTime()) {
        firstPurchaseByCustomer.set(customerKey, purchaseDate);
      }
    }

    return firstPurchaseByCustomer;
  }

  private toPlotDate(value: Date | string, detalization = 'day') {
    const date = new Date(value);
    const normalized = new Date(
      Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
    );

    switch (detalization) {
      case 'month':
        normalized.setUTCDate(1);
        break;
      case 'week': {
        const day = normalized.getUTCDay();
        const diff = day === 0 ? 6 : day - 1;
        normalized.setUTCDate(normalized.getUTCDate() - diff);
        break;
      }
      case 'day':
      default:
        break;
    }
    const year = normalized.getUTCFullYear();
    const month = String(normalized.getUTCMonth() + 1).padStart(2, '0');
    const day = String(normalized.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00:00`;
  }

  private roundMetric(value: unknown, fractionDigits = 2) {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
      return 0;
    }
    const factor = 10 ** Math.max(0, fractionDigits);
    return Math.round(numeric * factor) / factor;
  }

  private extractQueryStringArray(
    query: Record<string, string | undefined>,
    ...keys: string[]
  ) {
    for (const key of keys) {
      const value = query[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
      }
    }
    return [] as string[];
  }

  private async resolveShopBranchCodesFromQuery(
    query: Record<string, string | undefined>,
    context: any,
    keys: string[],
  ) {
    const shopKeys = this.extractQueryStringArray(query, ...keys);
    if (!shopKeys.length) {
      return [];
    }
    const shops = await this.db.shop.findMany({
      where: {
        ...(context?.companyId ? { companyId: context.companyId } : {}),
        OR: [{ id: { in: shopKeys } }, { branchCode: { in: shopKeys } }],
      },
      select: {
        branchCode: true,
      },
    });
    return shops.length
      ? shops.map((shop: any) => shop.branchCode).filter(Boolean)
      : shopKeys;
  }

  private async resolveShopIdsFromQuery(
    query: Record<string, string | undefined>,
    context: any,
    keys: string[],
  ) {
    const shopKeys = this.extractQueryStringArray(query, ...keys);
    if (!shopKeys.length) {
      return [];
    }
    const shops = await this.db.shop.findMany({
      where: {
        ...(context?.companyId ? { companyId: context.companyId } : {}),
        OR: [{ id: { in: shopKeys } }, { branchCode: { in: shopKeys } }],
      },
      select: {
        id: true,
      },
    });
    return shops.length ? shops.map((shop: any) => shop.id) : shopKeys;
  }

  private buildAppliedFilters(query: Record<string, string | undefined>) {
    return {
      from: this.firstQueryValue(
        query,
        'from',
        'date_from',
        'dateFrom',
        'start_date',
        'startDate',
      ),
      to: this.firstQueryValue(
        query,
        'to',
        'date_to',
        'dateTo',
        'end_date',
        'endDate',
      ),
      shopId: this.firstQueryValue(query, 'shopId', 'shop_id'),
      sellerId: this.firstQueryValue(query, 'sellerId', 'seller_id'),
      categoryId: this.firstQueryValue(query, 'categoryId', 'category_id'),
      productId: this.firstQueryValue(query, 'productId', 'product_id'),
      brandId: this.firstQueryValue(query, 'brandId', 'brand_id'),
      supplierId: this.firstQueryValue(query, 'supplierId', 'supplier_id'),
    };
  }

  private paginate<T>(items: T[], query: Record<string, string | undefined>) {
    const page = Math.max(1, this.toInt(query.page) ?? 1);
    const perPage = Math.max(
      1,
      Math.min(
        200,
        this.toInt(
          this.firstQueryValue(query, 'perPage', 'per_page', 'limit', 'page_size'),
        ) ?? 50,
      ),
    );
    const total = items.length;
    const start = (page - 1) * perPage;
    return {
      page,
      perPage,
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
      items: items.slice(start, start + perPage),
    };
  }

  private parseProductMetadata(metadata: unknown) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return { color: '', size: '', characteristics: [] as string[] };
    }

    const record = metadata as Record<string, unknown>;
    const rawCharacteristics = record.characteristics;

    return {
      color: this.optionalString(record.color) ?? '',
      size: this.optionalString(record.size) ?? '',
      characteristics: Array.isArray(rawCharacteristics)
        ? rawCharacteristics
            .map((item) => this.optionalString(item))
            .filter((item): item is string => Boolean(item))
        : [],
    };
  }

  private buildUserName(user: any) {
    if (!user) {
      return '';
    }
    return `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim();
  }

  private parseSellerId(value: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed)) {
      throw new BadRequestException('sellerId must be an integer');
    }

    return parsed;
  }

  private firstQueryValue(
    query: Record<string, string | undefined>,
    ...keys: string[]
  ) {
    for (const key of keys) {
      const value = query[key];
      if (typeof value === 'string' && value.trim().length > 0) {
        return value;
      }
    }

    return undefined;
  }

  private parseDate(value?: string) {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private toEndOfDay(value: Date) {
    const end = new Date(value);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private formatDate(value: Date, companyId?: string | null) {
    return this.companySettingsService.formatDateForCompany(
      value,
      companyId ?? undefined,
    );
  }

  private formatDateTime(value: Date | string, companyId?: string | null) {
    return this.companySettingsService.formatDateTimeForCompany(
      value,
      companyId ?? undefined,
    );
  }

  private optionalString(value: unknown) {
    return typeof value === 'string' ? value.trim() || undefined : undefined;
  }

  private toInt(value: unknown) {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : undefined;
  }

  private toNumber(value: unknown) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private toBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    return fallback;
  }
}

function queryTargetUndefined() {
  return undefined;
}
