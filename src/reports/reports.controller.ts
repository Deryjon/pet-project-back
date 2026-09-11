import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  CurrentCompanyContext,
  CurrentRequestContext,
} from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyRequestContext, RequestContext } from '../auth/request-context';
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

  @UseGuards(CompanyAccessGuard)
  @Get(SUMMARY_REPORT_ROUTES)
  getSummary(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSummary(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_REPORT_ROUTES)
  getGeneralReport(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralReport(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_REPORT_TABLE_ROUTES)
  getGeneralReportTable(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralReportTable(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_SALES_REPORT_ROUTES)
  getGeneralSalesReport(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralSalesReport(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_PRODUCT_REPORT_ROUTES)
  getGeneralProductReport(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralProductReport(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_SELLER_REPORT_ROUTES)
  getGeneralSellerReport(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralSellerReport(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(GENERAL_CUSTOMER_REPORT_ROUTES)
  getGeneralCustomerReport(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getGeneralCustomerReport(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SHOP_REPORT_ROUTES)
  getShops(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getShops(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SHOP_DETAIL_REPORT_ROUTES)
  getShopDetail(
    @Param('shopId') shopId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getShopDetail(shopId, query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_REPORT_ROUTES)
  getProducts(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProducts(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_SALES_REPORT_ROUTES)
  getProductSales(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductSales(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_SALES_REPORT_API_ROUTES)
  getProductSalesReportApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductSalesReportApi(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_EFFECTIVENESS_REPORT_ROUTES)
  getProductEffectiveness(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductEffectiveness(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_GENERAL_REPORT_API_ROUTES)
  getProductGeneralReportApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductGeneralReportApi(
      query,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_GENERAL_TABLE_API_ROUTES)
  getProductGeneralTableApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductGeneralTableApi(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_PERFORMANCE_REPORT_API_ROUTES)
  getProductPerformanceReportApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductPerformanceReportApi(
      query,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(REPORT_PRODUCT_PERFORMANCE_TABLE_API_ROUTES)
  getReportProductPerformanceTableApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getReportProductPerformanceTableApi(
      query,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(REPORT_PRODUCT_PERFORMANCE_TOTALS_API_ROUTES)
  getReportProductPerformanceTotalsApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getReportProductPerformanceTotalsApi(
      query,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_IMPORT_REPORT_ROUTES)
  getProductImports(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductImports(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(IMPORT_REPORT_TABLE_API_ROUTES)
  getImportReportTableApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getImportReportTableApi(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(IMPORT_REPORT_TOTALS_API_ROUTES)
  getImportReportTotalsApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getImportReportTotalsApi(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_SUPPLIER_REPORT_ROUTES)
  getProductSuppliers(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductSuppliers(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_SELLS_BY_SUPPLIERS_TABLE_API_ROUTES)
  getProductSellsBySuppliersTableApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductSellsBySuppliersTableApi(
      query,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(PRODUCT_STOCK_REPORT_ROUTES)
  getProductStocks(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getProductStocks(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(STOCK_REPORT_TABLE_API_ROUTES)
  getStockReportTableApi(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getStockReportTableApi(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(INVENTORY_RESULT_REPORT_ROUTES)
  getInventoryResults(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getInventoryResults(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(ORDER_RETURN_REPORT_ROUTES)
  getOrderReturns(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getOrderReturns(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(WRITE_OFF_REPORT_ROUTES)
  getWriteOffs(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getWriteOffs(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(ABC_ANALYSIS_REPORT_ROUTES)
  getAbcAnalysis(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getAbcAnalysis(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(TRANSFER_REPORT_ROUTES)
  getTransfers(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getTransfers(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SELLER_REPORT_ROUTES)
  getSellers(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSellers(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SELLER_SALES_REPORT_ROUTES)
  getSellerSales(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSellerSales(sellerId, query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SELLER_DETAIL_REPORT_ROUTES)
  getSellerDetail(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSellerDetail(sellerId, query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(CUSTOMER_REPORT_ROUTES)
  getCustomers(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getCustomers(query, requestContext);
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SELLER_SALARY_SETTINGS_ROUTES)
  getSellerSalarySettings(
    @Param('sellerId') sellerId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSellerSalarySettings(
      sellerId,
      requestContext,
    );
  }

  @Put(SELLER_SALARY_SETTINGS_ROUTES)
  updateSellerSalarySettings(
    @Param('sellerId') sellerId: string,
    @Body() body: Record<string, unknown>,
    @CurrentRequestContext() requestContext: RequestContext,
  ) {
    return this.reportsService.updateSellerSalarySettings(
      sellerId,
      body,
      requestContext,
    );
  }

  @UseGuards(CompanyAccessGuard)
  @Get(SELLER_SALARY_REPORT_ROUTES)
  getSellerSalaryReport(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.reportsService.getSellerSalaryReport(
      sellerId,
      query,
      requestContext,
    );
  }
}
