import {
  Body,
  Controller,
  Get,
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
