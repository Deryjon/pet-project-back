import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service';

@Controller()
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('reports/summary')
  getSummary(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSummary(query, authorization);
  }

  @Get('reports/shops')
  getShops(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getShops(query, authorization);
  }

  @Get('reports/shops/:shopId')
  getShopDetail(
    @Param('shopId') shopId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getShopDetail(shopId, query, authorization);
  }

  @Get('reports/products')
  getProducts(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProducts(query, authorization);
  }

  @Get('reports/products/sales')
  getProductSales(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSales(query, authorization);
  }

  @Get('reports/products/effectiveness')
  getProductEffectiveness(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductEffectiveness(query, authorization);
  }

  @Get('reports/products/imports')
  getProductImports(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductImports(query, authorization);
  }

  @Get('reports/products/suppliers')
  getProductSuppliers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductSuppliers(query, authorization);
  }

  @Get('reports/products/stocks')
  getProductStocks(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getProductStocks(query, authorization);
  }

  @Get('reports/products/inventory-results')
  getInventoryResults(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getInventoryResults(query, authorization);
  }

  @Get('reports/products/order-returns')
  getOrderReturns(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getOrderReturns(query, authorization);
  }

  @Get('reports/products/write-offs')
  getWriteOffs(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getWriteOffs(query, authorization);
  }

  @Get('reports/products/abc-analysis')
  getAbcAnalysis(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getAbcAnalysis(query, authorization);
  }

  @Get('reports/products/transfers')
  getTransfers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getTransfers(query, authorization);
  }

  @Get('reports/sellers')
  getSellers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellers(query, authorization);
  }

  @Get('reports/seller-sales/:sellerId')
  getSellerSales(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerSales(sellerId, query, authorization);
  }

  @Get('reports/sellers/:sellerId')
  getSellerDetail(
    @Param('sellerId') sellerId: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerDetail(sellerId, query, authorization);
  }

  @Get('reports/customers')
  getCustomers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getCustomers(query, authorization);
  }

  @Get('sellers/:sellerId/salary-settings')
  getSellerSalarySettings(
    @Param('sellerId') sellerId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.reportsService.getSellerSalarySettings(sellerId, authorization);
  }

  @Put('sellers/:sellerId/salary-settings')
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

  @Get('sellers/:sellerId/salary-report')
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
