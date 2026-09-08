import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import {
  Body,
  Controller,
  Get,
  Headers,
  Patch,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientsService } from './clients.service';

@Controller()
@UseGuards(JwtAuthGuard, CompanyAccessGuard, PermissionsGuard)
@Permissions('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post('clients')
  @Permissions('client-card-edit')
  createClient(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createClient(body, authorization);
  }

  @Get('clients')
  findAll(
    @Query() query: Record<string, string | string[] | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findAll(query, authorization);
  }

  @Get('v1/customers-list')
  findCustomersList(
    @Query() query: Record<string, string | string[] | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findCustomersList(query, authorization);
  }

  @Get('v1/customers-stats')
  getCustomersStats(@Headers('authorization') authorization?: string) {
    return this.clientsService.getCustomersStats(authorization);
  }

  @Get('clients/filters')
  getFilters(@Headers('authorization') authorization?: string) {
    return this.clientsService.getFilters(authorization);
  }

  @Get('client-groups')
  getGroups(@Headers('authorization') authorization?: string) {
    return this.clientsService.getGroups(authorization);
  }

  @Post('client-groups')
  @Permissions('client-card-edit')
  createGroup(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createGroup(body, authorization);
  }

  @Get('client-tags')
  getTags(@Headers('authorization') authorization?: string) {
    return this.clientsService.getTags(authorization);
  }

  @Post('client-tags')
  @Permissions('client-card-edit')
  createTag(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createTag(body, authorization);
  }

  @Get('clients/debts')
  @Permissions('debt-detail')
  getAllDebts(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getAllDebts(query, authorization);
  }

  @Get('clients/:id')
  @Permissions('client-card')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findOne(id, authorization);
  }

  @Get('v1/customer/:id')
  @Permissions('client-card')
  findCustomerCard(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findCustomerCard(id, authorization);
  }

  @Patch('clients/:id')
  @Permissions('client-card-edit')
  updateClient(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.updateClient(id, body, authorization);
  }

  @Get('clients/:id/notes')
  @Permissions('client-card')
  getNotes(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getNotes(id, authorization);
  }

  @Post('clients/:id/notes')
  @Permissions('client-card-edit')
  createNote(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createNote(id, body, authorization);
  }

  @Get('clients/:id/history')
  @Permissions('client-card')
  getHistory(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getHistory(id, query, authorization);
  }

  @Get('clients/:id/preferences')
  @Permissions('client-card')
  getPreferences(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getPreferences(id, authorization);
  }

  @Get('clients/:id/debts')
  @Permissions('debt-detail')
  getDebts(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getClientDebts(id, query, authorization);
  }

  @Post('clients/:id/debts')
  @Permissions('debt-edit')
  createDebt(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createDebt(id, body, authorization);
  }

  @Post('clients/:id/debts/:debtId/repayment')
  @Permissions('debt-cancel')
  repayDebt(
    @Param('id') id: string,
    @Param('debtId') debtId: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.repayDebt(id, debtId, body, authorization);
  }

  @Get('clients/:id/cards')
  @Permissions('client-card')
  getCards(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getCards(id, authorization);
  }

  @Post('clients/:id/cards')
  @Permissions('client-card-edit')
  createCard(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createCard(id, body, authorization);
  }
}
