import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
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

  @Get(['sales/:id/receipt', 'v1/sales/:id/receipt'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getReceipt(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getOrCreateForSale(id, companyId);
  }

  @Post(['sales/:id/receipt/mark-printed', 'v1/sales/:id/receipt/mark-printed'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async markPrinted(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.markPrinted(id, companyId);
  }

  // send-telegram deferred — future work should reuse TelegramService.sendMessage()

  @Get(['branches/:id/receipt-settings', 'v1/branches/:id/receipt-settings'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getReceiptSettings(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getReceiptSettings(id, companyId);
  }

  @Patch(['branches/:id/receipt-settings', 'v1/branches/:id/receipt-settings'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async updateReceiptSettings(
    @Param('id') id: string,
    @Body() dto: UpdateReceiptSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.updateReceiptSettings(id, dto, companyId);
  }
}
