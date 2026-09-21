import {
  Body,
  Controller,
  Get,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
import { WarehouseService } from './warehouse.service';

@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Controller()
@Permissions('inventory-list')
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('v1/write-offs')
  @Permissions('write-offs')
  getWriteOffs(
    @Query() query: Record<string, string>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.listMovements(
      'WRITE_OFF',
      query,
      requestContext,
    );
  }

  @Get('v1/inventory')
  getInventory(
    @Query() query: Record<string, string>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.listMovements(
      'PURCHASE',
      query,
      requestContext,
    );
  }

  @Get('v1/revaluation')
  @Permissions('product-revaluation')
  getRevaluation(
    @Query() query: Record<string, string>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.listRevaluations(query, requestContext);
  }

  @Get('v1/purchase-orders')
  @Permissions('all-orders')
  getPurchaseOrders(
    @Query() query: Record<string, string>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.listMovements(
      'PURCHASE',
      query,
      requestContext,
    );
  }

  @Get('v1/inventory-sessions')
  listInventorySessions(
    @Query() query: Record<string, string>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.listInventorySessions(query, requestContext);
  }

  @Get('v1/inventory-sessions/:id')
  @Permissions('inventory-result')
  getInventorySession(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.getInventorySession(id, requestContext);
  }

  @Post('v1/inventory-sessions')
  @Permissions('inventory-create')
  createInventorySession(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.createInventorySession(body, requestContext);
  }

  @Patch('v1/inventory-sessions/:id')
  @Permissions('inventory-create')
  updateInventorySession(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.updateInventorySession(id, body, context);
  }

  @Post('v1/inventory-sessions/:id/start')
  @Permissions('inventory-create')
  startInventory(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.startInventory(id, body, context);
  }

  @Get('v1/inventory-sessions/:id/items')
  @Permissions('inventory-result')
  listInventoryItems(@Param('id') id: string, @Query() query: Record<string, string>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.listInventoryItems(id, query, context);
  }

  @Patch('v1/inventory-sessions/:id/items/:itemId/count')
  @Permissions('inventory-create')
  countInventoryItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.countInventoryItem(id, itemId, body, context);
  }

  @Post('v1/inventory-sessions/:id/scan')
  @Permissions('inventory-create')
  scanInventory(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.scanInventory(id, body, context);
  }

  @Get('v1/inventory-sessions/:id/summary')
  @Permissions('inventory-result')
  inventorySummary(@Param('id') id: string, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.summary(id, context);
  }

  @Post('v1/inventory-sessions/:id/submit')
  @Permissions('inventory-create')
  submitInventory(@Param('id') id: string, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.submitInventory(id, context);
  }

  @Post('v1/inventory-sessions/:id/mark-uncounted-as-zero')
  @Permissions('inventory-finish')
  markUncountedAsZero(@Param('id') id: string, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.markUncountedAsZero(id, context);
  }

  @Post('v1/inventory-sessions/:id/items/:itemId/request-recount')
  @Permissions('inventory-finish')
  requestRecount(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.requestRecount(id, itemId, body, context);
  }

  @Post('v1/inventory-sessions/:id/items/:itemId/approve')
  @Permissions('inventory-finish')
  approveItem(@Param('id') id: string, @Param('itemId') itemId: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.approveItem(id, itemId, body, context);
  }

  @Get('v1/inventory-sessions/:id/items/:itemId/attempts')
  @Permissions('inventory-result')
  getCountAttempts(@Param('id') id: string, @Param('itemId') itemId: string, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.getCountAttempts(id, itemId, context);
  }

  @Post('v1/inventory-sessions/:id/cancel')
  @Permissions('inventory-delete')
  cancelInventory(@Param('id') id: string, @Body() body: Record<string, unknown>, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.cancelInventory(id, body, context);
  }

  @Post('v1/inventory-sessions/:id/approve')
  @Permissions('inventory-finish')
  approveInventory(@Param('id') id: string, @CurrentCompanyContext() context: CompanyRequestContext) {
    return this.warehouseService.approveInventory(id, context);
  }

  @Post('v1/inventory-sessions/:id/items')
  @Permissions('inventory-create')
  addInventoryItem(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.addInventoryItem(id, body, requestContext);
  }

  @Post('v1/inventory-sessions/:id/apply')
  @Permissions('inventory-finish')
  applyInventory(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.warehouseService.applyInventory(id, requestContext);
  }
}
