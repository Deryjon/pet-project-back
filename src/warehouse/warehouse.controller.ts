import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import {
  Controller,
  Get,
  Post,
  Query,
  Param,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
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
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listMovements('WRITE_OFF', query, auth);
  }

  @Get('v1/inventory')
  getInventory(
    @Query() query: Record<string, string>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listMovements('PURCHASE', query, auth);
  }

  @Get('v1/revaluation')
  @Permissions('product-revaluation')
  getRevaluation(
    @Query() query: Record<string, string>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listRevaluations(query, auth);
  }

  @Get('v1/purchase-orders')
  @Permissions('all-orders')
  getPurchaseOrders(
    @Query() query: Record<string, string>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listMovements('PURCHASE', query, auth);
  }

  @Get('v1/inventory-sessions')
  listInventorySessions(
    @Query() query: Record<string, string>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listInventorySessions(query, auth);
  }

  @Get('v1/inventory-sessions/:id')
  @Permissions('inventory-result')
  getInventorySession(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.getInventorySession(id, auth);
  }

  @Post('v1/inventory-sessions')
  @Permissions('inventory-create')
  createInventorySession(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.createInventorySession(body, auth);
  }

  @Post('v1/inventory-sessions/:id/items')
  @Permissions('inventory-create')
  addInventoryItem(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.addInventoryItem(id, body, auth);
  }

  @Post('v1/inventory-sessions/:id/apply')
  @Permissions('inventory-finish')
  applyInventory(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.applyInventory(id, auth);
  }
}
