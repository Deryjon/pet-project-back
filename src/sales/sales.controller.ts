import {
  Body,
  Controller,
  Delete,
  Get,
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
  findAll() {
    return this.salesService.findAll();
  }

  @Post('new-sale')
  createDraft() {
    return this.salesService.createDraft();
  }

  @Post('v2/order')
  createOrder(@Body() body: Record<string, unknown>) {
    return this.salesService.createOrder(body);
  }

  @Get('v2/order/:id')
  findOrder(@Param('id') id: string) {
    return this.salesService.findOrder(id);
  }

  @Get('v2/new-sale/products')
  findProductsForNewSale(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('shop_id') shopId?: string,
  ) {
    return this.salesService.findProductsForNewSale({
      page: Number(page) || 1,
      limit: Number(limit) || 10,
      search: search?.trim(),
      shopId: shopId?.trim(),
    });
  }

  @Post('v2/order-payment/:id')
  payOrder(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.salesService.payOrder(id, body);
  }

  @Get('new-sale/:id')
  findDraft(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.findDraft(id);
  }

  @Post('new-sale/:id/items')
  addItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: Record<string, unknown>,
  ) {
    return this.salesService.addItem(id, body);
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
  ) {
    return this.salesService.pay(id, body);
  }

  @Delete('new-sale/:id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.salesService.removeDraft(id);
  }
}
