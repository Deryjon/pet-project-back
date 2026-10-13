import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { AnyPermission } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { PurchaseOrdersService } from './purchase-orders.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Controller('v1/purchase-orders')
@AnyPermission('all-orders', 'order-detail')
export class PurchaseOrdersController {
  constructor(private readonly orders: PurchaseOrdersService) {}

  @Get()
  list(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.orders.list(query, requestContext);
  }

  @Get(':id')
  get(@Param('id') id: string, @CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.orders.get(id, requestContext);
  }

  @Post()
  @AnyPermission('order-create')
  create(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.orders.create(body, requestContext);
  }

  @Patch(':id')
  @AnyPermission('order-edit', 'order-create')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.orders.update(id, body, requestContext);
  }

  @Post(':id/send')
  @AnyPermission('order-edit', 'order-create')
  send(@Param('id') id: string, @CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.orders.send(id, requestContext);
  }

  @Post(':id/receive')
  @AnyPermission('order-accept')
  receive(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.orders.receive(id, body, requestContext);
  }

  @Post(':id/close')
  @AnyPermission('order-accept')
  close(@Param('id') id: string, @CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.orders.close(id, requestContext);
  }

  @Post(':id/cancel')
  @AnyPermission('order-edit', 'order-create')
  cancel(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.orders.cancel(id, body, requestContext);
  }
}
