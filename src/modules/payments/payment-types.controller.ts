import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentCompanyContext } from '../../auth/company-context.decorator';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CompanyRequestContext } from '../../auth/request-context';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';
import { PaymentTypesService } from './payment-types.service';

@Controller('payment-types')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class PaymentTypesController {
  constructor(private readonly paymentTypesService: PaymentTypesService) {}

  @Post()
  @Permissions('payment-type-create')
  create(
    @Body() dto: CreatePaymentTypeDto,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.paymentTypesService.create(dto, requestContext);
  }

  @Get()
  @Permissions('payment-types.read')
  findAll(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.paymentTypesService.findAll(requestContext);
  }
}
