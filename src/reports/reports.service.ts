import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { ReportsMapper } from './reports.mapper';
import { ReportsRepository } from './reports.repository';
import { SalaryService } from './salary.service';
import { SellerReportsService } from './seller-reports.service';

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly reportsRepository: ReportsRepository,
    private readonly reportsMapper: ReportsMapper,
    private readonly salaryService: SalaryService,
    private readonly sellerReportsService: SellerReportsService,
  ) {}

  private get db(): any {
    return this.prisma as any;
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
      ),
    );

    return {
      ...this.toGeneralReportMetrics(summary),
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
    const shopMap = new Map(
      shops.map((shop) => [shop.branchCode, shop] as const),
    );
    const grouped = new Map<string, any[]>();

    for (const sale of sales) {
      const date = this.toPlotDate(sale.paidAt ?? sale.createdAt);
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
                  branchCode: shop.branchCode,
                }
              : undefined,
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
    const customers = new Map<string, { count: number; amount: number }>();

    for (const sale of sales) {
      const key = (sale.clientName ?? '').trim();
      if (!key || sale.saleType === 'return') {
        continue;
      }
      const existing = customers.get(key) ?? { count: 0, amount: 0 };
      existing.count += 1;
      existing.amount += this.getSaleNetAmount(sale);
      customers.set(key, existing);
    }

    const topClientEntry = [...customers.entries()].sort(
      (a, b) => b[1].count - a[1].count,
    )[0];
    const topTransactionEntry = [...customers.entries()].sort(
      (a, b) => b[1].amount - a[1].amount,
    )[0];

    return {
      shop_plot: this.buildGeneralShopPlot(
        sales,
        plotShops,
        () => 0,
      ),
      top_client: topClientEntry
        ? {
            customer_id: '',
            name: topClientEntry[0],
            purchase_amount: topClientEntry[1].count,
          }
        : {
            customer_id: '',
            name: '',
            purchase_amount: 0,
          },
      top_transaction: topTransactionEntry
        ? {
            customer_id: '',
            name: topTransactionEntry[0],
            total_price: topTransactionEntry[1].amount,
          }
        : {
            customer_id: '',
            name: '',
            total_price: 0,
          },
      record_date: '',
      shop_stats: shops.map((shop) => ({
        shop_id: shop.id,
        shop_name: shop.name,
        new: 0,
        returned: 0,
      })),
      new_count: 0,
      returned_count: 0,
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
          in: ['paid', 'returned'],
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
          existing.returns += item.quantity;
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

        current.sold_quantity += sign > 0 ? item.quantity : 0;
        current.returned_quantity += sign < 0 ? item.quantity : 0;
        current.revenue += this.getItemRetailPrice(item) * sign;
        current.net_gross_sales += this.getItemFinalPrice(item) * sign;
        current.supply_cost += this.getItemSupplyPrice(item) * sign;
        current.gross_profit += this.getItemProfit(item) * sign;
        current.average_discount += this.getItemDiscount(item);
        current.average_price += item.quantity
          ? this.getItemFinalPrice(item) / item.quantity
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
            (returnedByProduct.get(item.productId) ?? 0) + item.quantity,
          );
        } else {
          soldByProduct.set(
            item.productId,
            (soldByProduct.get(item.productId) ?? 0) + item.quantity,
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
          existing.products_count.add(item.productId);
          existing.stock_left += this.resolveStockLeft(item.product);
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
          existing.returns += item.quantity;
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
      const key = this.formatDate(sale.paidAt ?? sale.createdAt);
      byDay.set(key, (byDay.get(key) ?? 0) + this.getSaleNetAmount(sale));
    }
    return [...byDay.entries()].map(([date, amount]) => ({ date, amount }));
  }

  private groupProfitByDay(sales: any[]) {
    const byDay = new Map<string, number>();
    for (const sale of sales) {
      const key = this.formatDate(sale.paidAt ?? sale.createdAt);
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

  private toGeneralReportMetrics(summary: any, shop?: { id: string; name: string }) {
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
      gross_sales: Number(summary.gross_sales ?? 0),
      discount_sum: Number(summary.discount_sum ?? 0),
      discount_percent: Number(summary.discount_percent ?? 0),
      products_returned: 0,
      products_exchanged: 0,
      returned_supply_price: 0,
      returned_discount_price: 0,
      returned_retail_price: 0,
      sales_supply_price: salesSupplyPrice,
      net_gross_sales: Number(summary.net_gross_sales ?? 0),
      gross_profit: Number(summary.gross_profit ?? 0),
      average_cheque: Number(summary.average_cheque ?? 0),
      average_price:
        Number(summary.products_sold ?? 0) > 0
          ? Number(summary.net_gross_sales ?? 0) / Number(summary.products_sold ?? 0)
          : 0,
      sales: 0,
      average_measurement_value:
        Number(summary.transactions_count ?? 0) > 0
          ? Number(summary.products_sold ?? 0) / Number(summary.transactions_count ?? 0)
          : 0,
      average_discount: 0,
      average_extra_charge: Number(summary.average_extra_charge ?? 0),
      products_sold: Number(summary.products_sold ?? 0),
      imported_measurement_value: 0,
      imported_retail_price: 0,
      imported_supply_price: 0,
      transactions_count: Number(summary.transactions_count ?? 0),
      orders_count: Number(summary.transactions_count ?? 0),
      returns_count: Number(summary.returns_count ?? 0),
      exchanges_count: Number(summary.exchanges_count ?? 0),
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
    valueResolver: (sales: any[]) => number,
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
          );
        }
        return row;
      });
  }

  private toPlotDate(value: Date | string) {
    const date = new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day} 00:00:00`;
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

  private formatDate(value: Date) {
    return value.toISOString().slice(0, 10);
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
