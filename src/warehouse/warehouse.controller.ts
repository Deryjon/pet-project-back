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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WarehouseService } from './warehouse.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class WarehouseController {
  constructor(private readonly warehouseService: WarehouseService) {}

  @Get('v1/write-offs')
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
  getRevaluation(
    @Query() query: Record<string, string>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.listRevaluations(query, auth);
  }

  @Get('v1/purchase-orders')
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
  getInventorySession(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.getInventorySession(id, auth);
  }

  @Post('v1/inventory-sessions')
  createInventorySession(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.createInventorySession(body, auth);
  }

  @Post('v1/inventory-sessions/:id/items')
  addInventoryItem(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.addInventoryItem(id, body, auth);
  }

  @Post('v1/inventory-sessions/:id/apply')
  applyInventory(
    @Param('id') id: string,
    @Headers('authorization') auth?: string,
  ) {
    return this.warehouseService.applyInventory(id, auth);
  }
}
