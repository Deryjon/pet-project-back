import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportsService } from './reports.service';

const versioned = (routes: string[]) =>
  routes.flatMap((route) => [route, `v1/${route}`, `v2/${route}`]);

const SUMMARY_REPORT_ROUTES = versioned([
  'reports/summary',
  'reports/shop/summary',
  'reports/shop/transactions',
  'reports/finances',
  'reports/finances/summary',
  'reports/finances/movements',
  'reports/favorites',
]);
const SHOP_REPORT_ROUTES = versioned(['reports/shops', 'reports/shop']);
const SHOP_DETAIL_REPORT_ROUTES = versioned([
  'reports/shops/:shopId',
  'reports/shop/:shopId',
]);
const PRODUCT_REPORT_ROUTES = versioned([
  'reports/products',
  'reports/products/summary',
]);
const PRODUCT_SALES_REPORT_ROUTES = versioned([
  'reports/products/sales',
  'reports/products/sold',
]);
const PRODUCT_EFFECTIVENESS_REPORT_ROUTES = versioned([
  'reports/products/effectiveness',
  'reports/products/efficiency',
]);
const PRODUCT_IMPORT_REPORT_ROUTES = versioned([
  'reports/products/imports',
  'reports/products/import',
]);
const PRODUCT_SUPPLIER_REPORT_ROUTES = versioned([
  'reports/products/suppliers',
  'reports/products/supplier',
]);
const PRODUCT_STOCK_REPORT_ROUTES = versioned([
  'reports/products/stocks',
  'reports/products/leftover',
]);
const INVENTORY_RESULT_REPORT_ROUTES = versioned([
  'reports/products/inventory-results',
  'reports/stocktaking',
]);
const ORDER_RETURN_REPORT_ROUTES = versioned([
  'reports/products/order-returns',
  'reports/supplier-order-return',
]);
const WRITE_OFF_REPORT_ROUTES = versioned([
  'reports/products/write-offs',
  'reports/writeoff',
]);
const ABC_ANALYSIS_REPORT_ROUTES = versioned([
  'reports/products/abc-analysis',
  'reports/abc-segmentation',
]);
const TRANSFER_REPORT_ROUTES = versioned([
  'reports/products/transfers',
  'reports/products/transfer',
]);
const SELLER_REPORT_ROUTES = versioned([
  'reports/sellers',
  'reports/report-seller',
  'reports/sellers/products',
]);
const SELLER_SALES_REPORT_ROUTES = versioned([
  'reports/seller-sales/:sellerId',
  'reports/sellers/:sellerId/sales',
]);
const SELLER_DETAIL_REPORT_ROUTES = versioned(['reports/sellers/:sellerId']);
const CUSTOMER_REPORT_ROUTES = versioned([
  'reports/customers',
  'reports/clients',
  'reports/clients/summary',
  'reports/clients/purchases',
]);
const SELLER_SALARY_SETTINGS_ROUTES = versioned([
  'sellers/:sellerId/salary-settings',
  'reports/sellers/:sellerId/salary-settings',
]);
const SELLER_SALARY_REPORT_ROUTES = versioned([
  'sellers/:sellerId/salary-report',
  'reports/sellers/:sellerId/salary-report',
]);
const GENERAL_REPORT_ROUTES = versioned(['general-report']);
const GENERAL_REPORT_TABLE_ROUTES = versioned(['general-report-table']);
const GENERAL_SALES_REPORT_ROUTES = versioned(['general-sales-report']);
const GENERAL_PRODUCT_REPORT_ROUTES = versioned(['general-product-report']);
const GENERAL_SELLER_REPORT_ROUTES = versioned(['general-seller-report']);
const GENERAL_CUSTOMER_REPORT_ROUTES = versioned(['general-customer-report']);
const PRODUCT_SALES_REPORT_API_ROUTES = versioned(['product-sales-report']);
const PRODUCT_GENERAL_REPORT_API_ROUTES = versioned(['product-general-report']);
const PRODUCT_GENERAL_TABLE_API_ROUTES = versioned(['product-general-table']);
const PRODUCT_PERFORMANCE_REPORT_API_ROUTES = versioned([
  'product-performance-report',
]);
const REPORT_PRODUCT_PERFORMANCE_TABLE_API_ROUTES = versioned([
  'report-product-performance-table',
]);
const REPORT_PRODUCT_PERFORMANCE_TOTALS_API_ROUTES = versioned([
  'report-product-performance-totals',
]);
const IMPORT_REPORT_TABLE_API_ROUTES = versioned(['import-report-table']);
const IMPORT_REPORT_TOTALS_API_ROUTES = versioned(['import-report-totals']);
const PRODUCT_SELLS_BY_SUPPLIERS_TABLE_API_ROUTES = versioned([
  'product-sells-by-suppliers-table',
]);
const STOCK_REPORT_TABLE_API_ROUTES = versioned(['stock-report-table']);

@UseGuards(JwtAuthGuard)
@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get(SUMMARY_REPORT_ROUTES)
  getSummary(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSummary(query, authorization);
  }

  @Get(GENERAL_REPORT_ROUTES)
  getGeneralReport(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralReport(query, authorization);
  }

  @Get(GENERAL_REPORT_TABLE_ROUTES)
  getGeneralReportTable(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralReportTable(query, authorization);
  }

  @Get(GENERAL_SALES_REPORT_ROUTES)
  getGeneralSalesReport(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralSalesReport(query, authorization);
  }

  @Get(GENERAL_PRODUCT_REPORT_ROUTES)
  getGeneralProductReport(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralProductReport(query, authorization);
  }

  @Get(GENERAL_SELLER_REPORT_ROUTES)
  getGeneralSellerReport(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralSellerReport(query, authorization);
  }

  @Get(GENERAL_CUSTOMER_REPORT_ROUTES)
  getGeneralCustomerReport(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getGeneralCustomerReport(query, authorization);
  }

  @Get(SHOP_REPORT_ROUTES)
  getShops(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getShops(query, authorization);
  }

  @Get(SHOP_DETAIL_REPORT_ROUTES)
  getShopDetail(
    @Param('shopId') shopId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getShopDetail(shopId, query, authorization);
  }

  @Get(PRODUCT_REPORT_ROUTES)
  getProducts(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProducts(query, authorization);
  }

  @Get(PRODUCT_SALES_REPORT_ROUTES)
  getProductSales(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSales(query, authorization);
  }

  @Get(PRODUCT_SALES_REPORT_API_ROUTES)
  getProductSalesReportApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSalesReportApi(query, authorization);
  }

  @Get(PRODUCT_EFFECTIVENESS_REPORT_ROUTES)
  getProductEffectiveness(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductEffectiveness(query, authorization);
  }

  @Get(PRODUCT_GENERAL_REPORT_API_ROUTES)
  getProductGeneralReportApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductGeneralReportApi(
      query,
      authorization,
    );
  }

  @Get(PRODUCT_GENERAL_TABLE_API_ROUTES)
  getProductGeneralTableApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductGeneralTableApi(query, authorization);
  }

  @Get(PRODUCT_PERFORMANCE_REPORT_API_ROUTES)
  getProductPerformanceReportApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductPerformanceReportApi(
      query,
      authorization,
    );
  }

  @Get(REPORT_PRODUCT_PERFORMANCE_TABLE_API_ROUTES)
  getReportProductPerformanceTableApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getReportProductPerformanceTableApi(
      query,
      authorization,
    );
  }

  @Get(REPORT_PRODUCT_PERFORMANCE_TOTALS_API_ROUTES)
  getReportProductPerformanceTotalsApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getReportProductPerformanceTotalsApi(
      query,
      authorization,
    );
  }

  @Get(PRODUCT_IMPORT_REPORT_ROUTES)
  getProductImports(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductImports(query, authorization);
  }

  @Get(IMPORT_REPORT_TABLE_API_ROUTES)
  getImportReportTableApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getImportReportTableApi(query, authorization);
  }

  @Get(IMPORT_REPORT_TOTALS_API_ROUTES)
  getImportReportTotalsApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getImportReportTotalsApi(query, authorization);
  }

  @Get(PRODUCT_SUPPLIER_REPORT_ROUTES)
  getProductSuppliers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSuppliers(query, authorization);
  }

  @Get(PRODUCT_SELLS_BY_SUPPLIERS_TABLE_API_ROUTES)
  getProductSellsBySuppliersTableApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSellsBySuppliersTableApi(
      query,
      authorization,
    );
  }

  @Get(PRODUCT_STOCK_REPORT_ROUTES)
  getProductStocks(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductStocks(query, authorization);
  }

  @Get(STOCK_REPORT_TABLE_API_ROUTES)
  getStockReportTableApi(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getStockReportTableApi(query, authorization);
  }

  @Get(INVENTORY_RESULT_REPORT_ROUTES)
  getInventoryResults(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getInventoryResults(query, authorization);
  }

  @Get(ORDER_RETURN_REPORT_ROUTES)
  getOrderReturns(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getOrderReturns(query, authorization);
  }

  @Get(WRITE_OFF_REPORT_ROUTES)
  getWriteOffs(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getWriteOffs(query, authorization);
  }

  @Get(ABC_ANALYSIS_REPORT_ROUTES)
  getAbcAnalysis(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getAbcAnalysis(query, authorization);
  }

  @Get(TRANSFER_REPORT_ROUTES)
  getTransfers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getTransfers(query, authorization);
  }

  @Get(SELLER_REPORT_ROUTES)
  getSellers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellers(query, authorization);
  }

  @Get(SELLER_SALES_REPORT_ROUTES)
  getSellerSales(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerSales(sellerId, query, authorization);
  }

  @Get(SELLER_DETAIL_REPORT_ROUTES)
  getSellerDetail(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerDetail(sellerId, query, authorization);
  }

  @Get(CUSTOMER_REPORT_ROUTES)
  getCustomers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getCustomers(query, authorization);
  }

  @Get(SELLER_SALARY_SETTINGS_ROUTES)
  getSellerSalarySettings(
    @Param('sellerId') sellerId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerSalarySettings(sellerId, authorization);
  }

  @Put(SELLER_SALARY_SETTINGS_ROUTES)
  updateSellerSalarySettings(
    @Param('sellerId') sellerId: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.updateSellerSalarySettings(
      sellerId,
      body,
      authorization,
    );
  }

  @Get(SELLER_SALARY_REPORT_ROUTES)
  getSellerSalaryReport(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerSalaryReport(
      sellerId,
      query,
      authorization,
    );
  }
}
