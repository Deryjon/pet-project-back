import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReceiptsService } from './receipts.service';
import { UsersService } from '../users/users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { UpdateChequeSettingsDto } from './dto/update-cheque-settings.dto';
import { CreateChequeTemplateDto } from './dto/create-cheque-template.dto';

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

  // Read-only: the template actually used to render/print receipts (isDefault=true).
  @Get(['cheque-settings', 'v1/cheque-settings'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getChequeSettings(@Headers('authorization') authorization?: string) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getChequeSettings(companyId);
  }

  @Get(['cheque', 'v1/cheque'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async listCheque(
    @Query() query: { name?: string; page?: string; limit?: string },
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.listChequeTemplates(companyId, query);
  }

  @Get(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard)
  async getChequeById(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.getChequeTemplateById(companyId, id);
  }

  @Post(['cheque', 'v1/cheque'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async createCheque(
    @Body() dto: CreateChequeTemplateDto,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.createChequeTemplate(companyId, dto.name);
  }

  @Put(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async updateChequeById(
    @Param('id') id: string,
    @Body() dto: UpdateChequeSettingsDto,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.updateChequeTemplate(companyId, id, dto);
  }

  @Delete(['cheque/:id', 'v1/cheque/:id'])
  @UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
  @Permissions('cheque-edit')
  async deleteChequeById(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const companyId = await this.requireCompanyId(authorization);
    return this.receiptsService.deleteChequeTemplate(companyId, id);
  }
}
