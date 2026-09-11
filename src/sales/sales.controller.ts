import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { SalesService } from './sales.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Controller()
@Permissions('orders.read')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('sales')
  @Permissions('sales.read')
  findAll(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findAll(query, requestContext);
  }

  @Post('new-sale')
  @Permissions('orders.create')
  createDraft(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.salesService.createDraft(requestContext);
  }

  @Get(['parked-sales', 'v2/parked-sales'])
  findParkedSales(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findParkedSales(requestContext);
  }

  @Get(['draft-sales', 'v2/draft-sales'])
  findDraftSales(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findDraftSales(requestContext);
  }

  @Post(['order', 'v2/order'])
  @Permissions('orders.create')
  createOrder(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.createOrder(body, requestContext);
  }

  @Get(['order/:id', 'v2/order/:id'])
  @Permissions('orders.read')
  findOrder(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findOrder(id, requestContext);
  }

  @Get(['order/:id/audit-logs', 'v2/order/:id/audit-logs'])
  @Permissions('sales.read')
  findOrderAuditLogs(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findOrderAuditLogs(id, requestContext);
  }

  @Get(['order-draft-debt/:id', 'v1/order-draft-debt/:id'])
  @Permissions('orders.read')
  findOrderDraftDebt(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findOrderDraftDebt(id, requestContext);
  }

  @Get(['order-search', 'v3/order-search'])
  @Permissions('sales.read')
  searchOrders(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.searchOrders(query, requestContext);
  }

  @Get(['order-search-stats', 'v3/order-search-stats'])
  @Permissions('sales.read')
  searchOrderStats(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.searchOrderStats(query, requestContext);
  }

  @Get(['new-sale/products', 'v2/new-sale/products'])
  findProductsForNewSale(
    @Query('page') page: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('search') search: string | undefined,
    @Query('shop_id') shopId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findProductsForNewSale(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search: search?.trim(),
        shopId: shopId?.trim(),
      },
      requestContext,
    );
  }

  @Post(['order-payment/:id', 'v2/order-payment/:id'])
  @Permissions('orders.create')
  payOrder(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.payOrder(id, body, requestContext);
  }

  @Post(['order/:id/return', 'v2/order/:id/return'])
  @Permissions('order-return')
  processReturn(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.processReturn(id, body, requestContext);
  }

  @Post(['order/:id/exchange', 'v2/order/:id/exchange'])
  @Permissions('order-return')
  processExchange(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.processExchange(id, body, requestContext);
  }

  @Patch(['order/:id/payment-method', 'v2/order/:id/payment-method'])
  @Permissions('payment-type')
  updatePaymentMethod(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.updatePaymentMethod(id, body, requestContext);
  }

  @Get('new-sale/:id')
  findDraft(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.findDraft(id, requestContext);
  }

  @Get('new-sale/:id/items')
  getDraftItems(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.getDraftItems(id, requestContext);
  }

  @Post('new-sale/:id/items')
  @Permissions('orders.create')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.addItem(id, body, requestContext);
  }

  @Delete([
    'new-sale/:id/items/:itemId',
    'v1/new-sale/:id/items/:itemId',
    'v2/new-sale/:id/items/:itemId',
  ])
  @Permissions('orders.create')
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.removeItem(id, itemId, requestContext);
  }

  @Patch([
    'new-sale/:id/items/:itemId',
    'v1/new-sale/:id/items/:itemId',
    'v2/new-sale/:id/items/:itemId',
  ])
  @Permissions('orders.create')
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.updateItem(id, itemId, body, requestContext);
  }

  @Put('new-sale/:id/discount')
  @Permissions('manual-discount')
  updateDiscount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.updateDiscount(id, body, requestContext);
  }

  @Patch([
    'new-sale/:id/customer',
    'v1/new-sale/:id/customer',
    'v2/new-sale/:id/customer',
    'new-sale/:id/client',
    'v1/new-sale/:id/client',
    'v2/new-sale/:id/client',
  ])
  @Permissions('orders.create')
  attachClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.attachClient(id, body, requestContext);
  }

  @Post('new-sale/:id/pay')
  @Permissions('orders.complete')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.pay(id, body, requestContext);
  }

  @Post([
    'new-sale/:id/park',
    'v1/new-sale/:id/park',
    'v2/new-sale/:id/park',
    'new-sale/:id/leave',
    'v1/new-sale/:id/leave',
    'v2/new-sale/:id/leave',
  ])
  @Permissions('orders.create')
  parkDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.parkDraft(id, body, requestContext);
  }

  @Post(['leave-sale/:id', 'v1/leave-sale/:id', 'v2/leave-sale/:id'])
  @Permissions('orders.create')
  leaveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.parkDraft(id, body, requestContext);
  }

  @Post([
    'parked-sales/:id/resume',
    'v2/parked-sales/:id/resume',
    'draft-sales/:id/resume',
    'v2/draft-sales/:id/resume',
  ])
  @Permissions('delay-finish')
  resumeParkedSale(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.resumeParkedSale(id, requestContext);
  }

  @Delete('new-sale/:id')
  @Permissions('orders.cancel')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.removeDraft(id, requestContext);
  }

  @Delete(['order/:id', 'v2/order/:id'])
  @Permissions('order-delete')
  removeOrder(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.salesService.removeOrder(id, requestContext, body);
  }
}
