import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentCompanyContext } from '../../auth/company-context.decorator';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CompanyRequestContext } from '../../auth/request-context';
import { CashboxesService } from './cashboxes.service';
import { CreateCashboxDto } from './dto/create-cashbox.dto';

@Controller('cashboxes')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class CashboxesController {
  constructor(private readonly cashboxesService: CashboxesService) {}

  @Post()
  @Permissions('cashbox-create')
  create(
    @Body() dto: CreateCashboxDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.cashboxesService.create(dto, requestContext);
  }

  @Get()
  @Permissions('cashboxes.read')
  findAll(
    @Query('shopId') shopId: string | undefined,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.cashboxesService.findAll(shopId, requestContext);
  }
}
