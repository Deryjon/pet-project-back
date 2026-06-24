import {
  Controller,
  Get,
  Query,
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
}
