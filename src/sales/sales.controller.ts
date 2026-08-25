import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Patch,
  ParseIntPipe,
  Query,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SalesService } from './sales.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('sales')
  findAll(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findAll(query, authorization);
  }

  @Post('new-sale')
  createDraft(@Headers('authorization') authorization?: string) {
    return this.salesService.createDraft(authorization);
  }

  @Get(['parked-sales', 'v2/parked-sales'])
  findParkedSales(@Headers('authorization') authorization?: string) {
    return this.salesService.findParkedSales(authorization);
  }

  @Get(['draft-sales', 'v2/draft-sales'])
  findDraftSales(@Headers('authorization') authorization?: string) {
    return this.salesService.findDraftSales(authorization);
  }

  @Post(['order', 'v2/order'])
  createOrder(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.createOrder(body, authorization);
  }

  @Get(['order/:id', 'v2/order/:id'])
  findOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findOrder(id, authorization);
  }

  @Get(['order-draft-debt/:id', 'v1/order-draft-debt/:id'])
  findOrderDraftDebt(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findOrderDraftDebt(id, authorization);
  }

  @Get(['order-search', 'v3/order-search'])
  searchOrders(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.searchOrders(query, authorization);
  }

  @Get(['order-search-stats', 'v3/order-search-stats'])
  searchOrderStats(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.searchOrderStats(query, authorization);
  }

  @Get(['new-sale/products', 'v2/new-sale/products'])
  findProductsForNewSale(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('shop_id') shopId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findProductsForNewSale(
      {
        page: Number(page) || 1,
        limit: Number(limit) || 10,
        search: search?.trim(),
        shopId: shopId?.trim(),
      },
      authorization,
    );
  }

  @Post(['order-payment/:id', 'v2/order-payment/:id'])
  payOrder(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.payOrder(id, body, authorization);
  }

  @Post(['order/:id/return', 'v2/order/:id/return'])
  processReturn(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.processReturn(id, body, authorization);
  }

  @Post(['order/:id/exchange', 'v2/order/:id/exchange'])
  processExchange(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.processExchange(id, body, authorization);
  }

  @Patch(['order/:id/payment-method', 'v2/order/:id/payment-method'])
  updatePaymentMethod(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.updatePaymentMethod(id, body, authorization);
  }

  @Get('new-sale/:id')
  findDraft(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findDraft(id, authorization);
  }

  @Get('new-sale/:id/items')
  getDraftItems(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.getDraftItems(id, authorization);
  }

  @Post('new-sale/:id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.addItem(id, body, authorization);
  }

  @Delete([
    'new-sale/:id/items/:itemId',
    'v1/new-sale/:id/items/:itemId',
    'v2/new-sale/:id/items/:itemId',
  ])
  removeItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.removeItem(id, itemId, authorization);
  }

  @Patch([
    'new-sale/:id/items/:itemId',
    'v1/new-sale/:id/items/:itemId',
    'v2/new-sale/:id/items/:itemId',
  ])
  updateItem(
    @Param('id', ParseIntPipe) id: number,
    @Param('itemId', ParseIntPipe) itemId: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.updateItem(id, itemId, body, authorization);
  }

  @Put('new-sale/:id/discount')
  updateDiscount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.updateDiscount(id, body, authorization);
  }

  @Patch([
    'new-sale/:id/customer',
    'v1/new-sale/:id/customer',
    'v2/new-sale/:id/customer',
    'new-sale/:id/client',
    'v1/new-sale/:id/client',
    'v2/new-sale/:id/client',
  ])
  attachClient(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.attachClient(id, body, authorization);
  }

  @Post('new-sale/:id/pay')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.pay(id, body, authorization);
  }

  @Post([
    'new-sale/:id/park',
    'v1/new-sale/:id/park',
    'v2/new-sale/:id/park',
    'new-sale/:id/leave',
    'v1/new-sale/:id/leave',
    'v2/new-sale/:id/leave',
  ])
  parkDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.parkDraft(id, body, authorization);
  }

  @Post(['leave-sale/:id', 'v1/leave-sale/:id', 'v2/leave-sale/:id'])
  leaveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.parkDraft(id, body, authorization);
  }

  @Post(['parked-sales/:id/resume', 'v2/parked-sales/:id/resume'])
  resumeParkedSale(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.resumeParkedSale(id, authorization);
  }

  @Delete('new-sale/:id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.removeDraft(id, authorization);
  }

  @Delete(['order/:id', 'v2/order/:id'])
  removeOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.removeOrder(id, authorization);
  }
}
