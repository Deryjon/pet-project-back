import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CompanyAccessGuard } from '../auth/guards/company-access.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ClientsService } from './clients.service';

@Controller()
@UseGuards(JwtAuthGuard, CompanyAccessGuard)
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Get('clients')
  findAll(
    @Query() query: Record<string, string | string[] | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findAll(query, authorization);
  }

  @Get('clients/filters')
  getFilters(@Headers('authorization') authorization?: string) {
    return this.clientsService.getFilters(authorization);
  }

  @Get('client-groups')
  getGroups(@Headers('authorization') authorization?: string) {
    return this.clientsService.getGroups(authorization);
  }

  @Get('client-tags')
  getTags(@Headers('authorization') authorization?: string) {
    return this.clientsService.getTags(authorization);
  }

  @Get('clients/:id')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.findOne(id, authorization);
  }

  @Get('clients/:id/notes')
  getNotes(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getNotes(id, authorization);
  }

  @Post('clients/:id/notes')
  createNote(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createNote(id, body, authorization);
  }

  @Get('clients/:id/history')
  getHistory(
    @Param('id') id: string,
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getHistory(id, query, authorization);
  }

  @Get('clients/:id/preferences')
  getPreferences(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getPreferences(id, authorization);
  }

  @Get('clients/:id/debts')
  getDebts(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getDebts(id, authorization);
  }

  @Post('clients/:id/debts/:debtId/repayment')
  repayDebt(
    @Param('id') id: string,
    @Param('debtId') debtId: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.repayDebt(id, debtId, body, authorization);
  }

  @Get('clients/:id/cards')
  getCards(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.getCards(id, authorization);
  }

  @Post('clients/:id/cards')
  createCard(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.clientsService.createCard(id, body, authorization);
  }
}
