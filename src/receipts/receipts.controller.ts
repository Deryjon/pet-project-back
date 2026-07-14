import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { UpdateReceiptSettingsDto } from './dto/update-receipt-settings.dto';

@Controller()
export class ReceiptsController {
  constructor(
    private readonly receiptsService: ReceiptsService,
    private readonly usersService: UsersService,
  ) {}

  private async requireCompanyId(authorization?: string) {
    const context = authorization
      ? await this.usersService.getRequestContext(authorization)
      : null;
    if (!context?.companyId) {
      throw new BadRequestException('Company context is required');
    }
    return context.companyId;
  }

  @Get(['receipts/by-number/:number', 'v1/receipts/by-number/:number'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getReceiptByNumber(
    @Param('number') number: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getByNumber(number, companyId);
  }

  @Get(['receipts/:saleId', 'v1/receipts/:saleId'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getReceipt(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getOrCreateForSale(saleId, companyId);
  }

  @Post(['receipts', 'v1/receipts'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async createReceipt(
    @Body('sale_id', ParseIntPipe) saleId: number,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getOrCreateForSale(saleId, companyId);
  }

  @Post(['receipts/:saleId/mark-printed', 'v1/receipts/:saleId/mark-printed'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async markPrinted(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.markPrinted(saleId, companyId);
  }

  // send-telegram deferred — future work should reuse TelegramService.sendMessage()

  @Get(['receipt-settings/:branchId', 'v1/receipt-settings/:branchId'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getReceiptSettings(
    @Param('branchId') branchId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getReceiptSettings(branchId, companyId);
  }

  @Put(['receipt-settings/:branchId', 'v1/receipt-settings/:branchId'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async updateReceiptSettings(
    @Param('branchId') branchId: string,
    @Body() dto: UpdateReceiptSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.updateReceiptSettings(branchId, dto, companyId);
  }
}
