import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../../auth/company-context.decorator';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CompanyRequestContext } from '../../auth/request-context';
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
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.createDraft(dto, requestContext);
  }

  @Get(':id')
  @Permissions('orders.read')
  findOne(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.findOne(id, requestContext);
  }

  @Post(':id/items')
  @Permissions('orders.create')
  addItem(
    @Param('id') id: string,
    @Body() dto: AddOrderItemDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.addItem(id, dto, requestContext);
  }

  @Patch(':id/items/:itemId')
  @Permissions('orders.create')
  updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateOrderItemDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.updateItemQuantity(
      id,
      itemId,
      dto,
      requestContext,
    );
  }

  @Delete(':id/items/:itemId')
  @Permissions('orders.create')
  removeItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.removeItem(id, itemId, requestContext);
  }

  @Post(':id/payments')
  @Permissions('payments.create')
  addPayment(
    @Param('id') id: string,
    @Body() dto: AddPaymentDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.addPayment(id, dto, requestContext);
  }

  @Delete(':id/payments/:paymentId')
  @Permissions('payments.create')
  removePayment(
    @Param('id') id: string,
    @Param('paymentId') paymentId: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.removePayment(id, paymentId, requestContext);
  }

  @Patch(':id/discount')
  @Permissions('orders.create')
  applyDiscount(
    @Param('id') id: string,
    @Body() dto: ApplyDiscountDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.applyDiscount(id, dto, requestContext);
  }

  @Patch(':id/customer')
  @Permissions('orders.create')
  attachCustomer(
    @Param('id') id: string,
    @Body() dto: AttachCustomerDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.attachCustomer(id, dto, requestContext);
  }

  @Patch(':id/comment')
  @Permissions('orders.create')
  updateComment(
    @Param('id') id: string,
    @Body() dto: UpdateOrderCommentDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.updateComment(id, dto, requestContext);
  }

  @Post(':id/cancel')
  @Permissions('orders.cancel')
  cancel(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.cancel(id, requestContext);
  }

  @Post(':id/park')
  @Permissions('orders.create')
  park(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.park(id, requestContext);
  }

  @Post(':id/resume')
  @Permissions('orders.create')
  resume(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.resume(id, requestContext);
  }

  @Post(':id/complete')
  @Permissions('orders.complete')
  complete(
    @Param('id') id: string,
    @Body() dto: CompleteOrderDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.ordersService.complete(id, dto, requestContext);
  }
}
