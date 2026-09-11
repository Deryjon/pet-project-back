import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentCompanyContext } from '../auth/company-context.decorator';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { Permissions } from '../auth/permissions.decorator';
import { CompanyRequestContext } from '../auth/request-context';
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
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createClient(body, requestContext);
  }

  @Get('clients')
  findAll(
    @Query() query: Record<string, string | string[] | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.findAll(query, requestContext);
  }

  @Get('v1/customers-list')
  findCustomersList(
    @Query() query: Record<string, string | string[] | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.findCustomersList(query, requestContext);
  }

  @Get('v1/customers-stats')
  getCustomersStats(
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getCustomersStats(requestContext);
  }

  @Get('clients/filters')
  getFilters(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.clientsService.getFilters(requestContext);
  }

  @Get('client-groups')
  getGroups(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.clientsService.getGroups(requestContext);
  }

  @Post('client-groups')
  @Permissions('client-card-edit')
  createGroup(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createGroup(body, requestContext);
  }

  @Get('client-tags')
  getTags(@CurrentCompanyContext() requestContext: CompanyRequestContext) {
    return this.clientsService.getTags(requestContext);
  }

  @Post('client-tags')
  @Permissions('client-card-edit')
  createTag(
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createTag(body, requestContext);
  }

  @Get('clients/debts')
  @Permissions('debt-detail')
  getAllDebts(
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getAllDebts(query, requestContext);
  }

  @Get('clients/:id')
  @Permissions('client-card')
  findOne(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.findOne(id, requestContext);
  }

  @Get('v1/customer/:id')
  @Permissions('client-card')
  findCustomerCard(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.findCustomerCard(id, requestContext);
  }

  @Patch('clients/:id')
  @Permissions('client-card-edit')
  updateClient(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.updateClient(id, body, requestContext);
  }

  @Get('clients/:id/notes')
  @Permissions('client-card')
  getNotes(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getNotes(id, requestContext);
  }

  @Post('clients/:id/notes')
  @Permissions('client-card-edit')
  createNote(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createNote(id, body, requestContext);
  }

  @Get('clients/:id/history')
  @Permissions('client-card')
  getHistory(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getHistory(id, query, requestContext);
  }

  @Get('clients/:id/preferences')
  @Permissions('client-card')
  getPreferences(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getPreferences(id, requestContext);
  }

  @Get('clients/:id/debts')
  @Permissions('debt-detail')
  getDebts(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getClientDebts(id, query, requestContext);
  }

  @Post('clients/:id/debts')
  @Permissions('debt-edit')
  createDebt(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createDebt(id, body, requestContext);
  }

  @Post('clients/:id/debts/:debtId/repayment')
  @Permissions('debt-cancel')
  repayDebt(
    @Param('id') id: string,
    @Param('debtId') debtId: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.repayDebt(id, debtId, body, requestContext);
  }

  @Get('clients/:id/cards')
  @Permissions('client-card')
  getCards(
    @Param('id') id: string,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.getCards(id, requestContext);
  }

  @Post('clients/:id/cards')
  @Permissions('client-card-edit')
  createCard(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @CurrentCompanyContext() requestContext: CompanyRequestContext,
  ) {
    return this.clientsService.createCard(id, body, requestContext);
  }
}
