import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CashboxesService } from './cashboxes.service';
import { CreateCashboxDto } from './dto/create-cashbox.dto';

@Controller('cashboxes')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class CashboxesController {
  constructor(private readonly cashboxesService: CashboxesService) {}

  @Post()
  @Permissions('cashboxes.manage')
  create(
    @Body() dto: CreateCashboxDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.cashboxesService.create(dto, authorization);
  }

  @Get()
  @Permissions('cashboxes.manage')
  findAll(
    @Query('shopId') shopId?: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.cashboxesService.findAll(shopId, authorization);
  }
}
