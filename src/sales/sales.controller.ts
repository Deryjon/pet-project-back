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
} from '@nestjs/common';
import { SalesService } from './sales.service';

@Controller()
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get('sales')
  findAll(@Headers('authorization') authorization?: string) {
    return this.salesService.findAll(authorization);
  }

  @Post('new-sale')
  createDraft(@Headers('authorization') authorization?: string) {
    return this.salesService.createDraft(authorization);
  }

  @Post('order')
  @Post('v2/order')
  createOrder(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.createOrder(body, authorization);
  }

  @Get('order/:id')
  @Get('v2/order/:id')
  findOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findOrder(id, authorization);
  }

  @Get('order-draft-debt/:id')
  @Get('v1/order-draft-debt/:id')
  findOrderDraftDebt(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.findOrderDraftDebt(id, authorization);
  }

  @Get('order-search')
  @Get('v3/order-search')
  searchOrders(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.searchOrders(query, authorization);
  }

  @Get('order-search-stats')
  @Get('v3/order-search-stats')
  searchOrderStats(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.searchOrderStats(query, authorization);
  }

  @Get('new-sale/products')
  @Get('v2/new-sale/products')
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

  @Post('order-payment/:id')
  @Post('v2/order-payment/:id')
  payOrder(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.payOrder(id, body, authorization);
  }

  @Patch('order/:id/payment-method')
  @Patch('v2/order/:id/payment-method')
  updatePaymentMethod(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.updatePaymentMethod(id, body, authorization);
  }

  @Get('new-sale/:id')
  findDraft(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findDraft(id);
  }

  @Post('new-sale/:id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.addItem(id, body, authorization);
  }

  @Put('new-sale/:id/discount')
  updateDiscount(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.salesService.updateDiscount(id, body);
  }

  @Post('new-sale/:id/pay')
  pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.pay(id, body, authorization);
  }

  @Delete('new-sale/:id')
  remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.removeDraft(id, authorization);
  }

  @Delete('order/:id')
  @Delete('v2/order/:id')
  removeOrder(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.salesService.removeOrder(id, authorization);
  }
}
