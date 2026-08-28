import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { SupplierInvoiceService } from '../services/supplier-invoice.service';

@Controller('supplier-invoices')
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
export class SupplierInvoicesController {
  constructor(private readonly invoices: SupplierInvoiceService) {}
  @Post() create(@Body() body: any, @Headers('authorization') auth?: string) {
    return this.invoices.create(body, auth);
  }
  @Get() list(@Query() query: any, @Headers('authorization') auth?: string) {
    return this.invoices.list(query, auth);
  }
  @Get(':id') get(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.get(id, auth);
  }
  @Post(':id/recognized-items') addItems(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.addItems(id, body, auth);
  }
  @Patch(':id/items/:itemId') updateItem(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.updateItem(id, itemId, body, auth);
  }
  @Post(':id/auto-match') autoMatch(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.autoMatch(id, auth);
  }
  @Post(':id/items/:itemId/match') match(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.matchItem(id, itemId, body, auth);
  }
  @Post(':id/allocations') allocate(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.allocate(id, body, auth);
  }
  @Post(':id/ready') ready(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.markReady(id, auth);
  }
  @Post(':id/commit') commit(
    @Param('id') id: string,
    @Body() body: any,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.commit(id, body, auth);
  }
  @Post(':id/cancel') cancel(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.cancel(id, auth);
  }
  @Post(':id/rollback') rollback(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.invoices.rollback(id, auth);
  }
}
