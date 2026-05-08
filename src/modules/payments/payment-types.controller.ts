import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/guards/permissions.guard';
import { Permissions } from '../../auth/permissions.decorator';
import { CreatePaymentTypeDto } from './dto/create-payment-type.dto';
import { PaymentTypesService } from './payment-types.service';

@Controller('payment-types')
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
export class PaymentTypesController {
  constructor(private readonly paymentTypesService: PaymentTypesService) {}

  @Post()
  @Permissions('payments.create')
  create(
    @Body() dto: CreatePaymentTypeDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.paymentTypesService.create(dto, authorization);
  }

  @Get()
  @Permissions('payments.create')
  findAll(@Headers('authorization') authorization?: string) {
    return this.paymentTypesService.findAll(authorization);
  }
}
