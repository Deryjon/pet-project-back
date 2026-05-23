import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { AddOrderItemDto } from './dto/add-order-item.dto';
import { AddPaymentDto } from './dto/add-payment.dto';
import { ApplyDiscountDto } from './dto/apply-discount.dto';
import { AttachCustomerDto } from './dto/attach-customer.dto';
import { CompleteOrderDto } from './dto/complete-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderCommentDto } from './dto/update-order-comment.dto';
import { UpdateOrderItemDto } from './dto/update-order-item.dto';
import { OrdersService } from './orders.service';

@Controller('orders')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Permissions('orders.create')
  create(
    @Body() dto: CreateOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.createDraft(dto, authorization);
  }

  @Get(':id')
  @Permissions('orders.read')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.findOne(id, authorization);
  }

  @Post(':id/items')
  @Permissions('orders.create')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddOrderItemDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.addItem(id, dto, authorization);
  }

  @Patch(':id/items/:itemId')
  @Permissions('orders.create')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.updateItemQuantity(
      id,
      itemId,
      dto,
      authorization,
    );
  }

  @Delete(':id/items/:itemId')
  @Permissions('orders.create')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.removeItem(id, itemId, authorization);
  }

  @Post(':id/payments')
  @Permissions('payments.create')
  addPayment(
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.addPayment(id, dto, authorization);
  }

  @Delete(':id/payments/:paymentId')
  @Permissions('payments.create')
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.removePayment(id, paymentId, authorization);
  }

  @Patch(':id/discount')
  @Permissions('orders.create')
  applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.applyDiscount(id, dto, authorization);
  }

  @Patch(':id/customer')
  @Permissions('orders.create')
  attachCustomer(
    @Param('id') id: string,
    @Body() dto: AttachCustomerDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.attachCustomer(id, dto, authorization);
  }

  @Patch(':id/comment')
  @Permissions('orders.create')
  updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateOrderCommentDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.updateComment(id, dto, authorization);
  }

  @Post(':id/cancel')
  @Permissions('orders.cancel')
  cancel(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.cancel(id, authorization);
  }

  @Post(':id/park')
  @Permissions('orders.create')
  park(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.park(id, authorization);
  }

  @Post(':id/resume')
  @Permissions('orders.create')
  resume(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.resume(id, authorization);
  }

  @Post(':id/complete')
  @Permissions('orders.complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteOrderDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.ordersService.complete(id, dto, authorization);
  }
}
