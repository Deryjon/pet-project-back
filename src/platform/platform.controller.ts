import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { PlatformAdminGuard } from '../auth/guards/platform-admin.guard';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UsersService } from '../users/users.service';
import { ChangePlanDto } from './dto/change-plan.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateEntityStatusDto } from './dto/update-entity-status.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { PlatformService } from './platform.service';

@UseGuards(PlatformAdminGuard)
@Controller()
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly usersService: UsersService,
  ) {}

  @Get('platform/dashboard/stats')
  getDashboardStats() {
    return this.platformService.getDashboardStats();
  }

  @Get('platform/companies')
  findCompanies() {
    return this.platformService.findCompanies();
  }

  @Get('platform/companies/:companyId')
  findCompany(@Param('companyId') companyId: string) {
    return this.platformService.findCompany(companyId);
  }

  @Post('platform/companies')
  createCompany(@Body() body: CreateCompanyDto) {
    return this.platformService.createCompany(
      body as unknown as Record<string, unknown>,
    );
  }

  @Put('platform/companies/:companyId')
  @Patch('platform/companies/:companyId')
  updateCompany(
    @Param('companyId') companyId: string,
    @Body() body: UpdateCompanyDto,
  ) {
    return this.platformService.updateCompany(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Patch('platform/companies/:companyId/status')
  updateCompanyStatus(
    @Param('companyId') companyId: string,
    @Body() body: UpdateEntityStatusDto,
  ) {
    return this.platformService.updateCompanyStatus(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Post('platform/companies/:companyId/block')
  blockCompany(
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.platformService.blockCompany(
      companyId,
      body,
      (req.user as { id: number }).id,
    );
  }

  @Post('platform/companies/:companyId/unblock')
  unblockCompany(
    @Param('companyId') companyId: string,
    @Req() req: Request,
  ) {
    return this.platformService.unblockCompany(
      companyId,
      (req.user as { id: number }).id,
    );
  }

  @Delete('platform/companies/:companyId')
  removeCompany(@Param('companyId') companyId: string) {
    return this.platformService.removeCompany(companyId);
  }

  @Get('platform/subscriptions')
  findSubscriptions() {
    return this.platformService.findSubscriptions();
  }

  @Post('platform/subscriptions/:id/renew')
  renewSubscription(@Param('id') id: string, @Req() req: Request) {
    return this.platformService.renewSubscription(
      id,
      (req.user as { id: number }).id,
    );
  }

  @Patch('platform/subscriptions/:id/plan')
  changeSubscriptionPlan(
    @Param('id') id: string,
    @Body() body: ChangePlanDto,
    @Req() req: Request,
  ) {
    return this.platformService.changePlan(
      id,
      body.plan_id,
      (req.user as { id: number }).id,
    );
  }

  @Post('platform/subscriptions/check-expired')
  checkExpiredSubscriptions(@Req() req: Request) {
    return this.platformService.checkExpiredSubscriptions(
      (req.user as { id: number }).id,
    );
  }

  @Get('platform/payments')
  findPayments() {
    return this.platformService.findPayments();
  }

  @Post('platform/payments')
  createPayment(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.platformService.createPayment(
      body,
      (req.user as { id: number }).id,
    );
  }

  @Get('platform/plans')
  findPlans() {
    return this.platformService.findPlans();
  }

  @Post('platform/plans')
  createPlan(@Body() body: Record<string, unknown>) {
    return this.platformService.createPlan(body);
  }

  @Patch('platform/plans/:id')
  updatePlan(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.platformService.updatePlan(id, body);
  }

  @Delete('platform/plans/:id')
  removePlan(@Param('id') id: string) {
    return this.platformService.removePlan(id);
  }

  @Get('platform/users')
  findPlatformUsers(@Headers('authorization') authorization?: string) {
    return this.usersService.findAll(authorization);
  }

  @Get('platform/users/:id')
  findPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findPlatformManagedUser(id, authorization);
  }

  @Put('platform/users/:id')
  @Patch('platform/users/:id')
  updatePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.update(
      id,
      body as unknown as Record<string, unknown>,
      req.user as never,
    );
  }

  @Post('platform/users/:id/block')
  blockPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.usersService.update(id, { is_active: false }, req.user as never);
  }

  @Post('platform/users/:id/unblock')
  unblockPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.usersService.update(id, { is_active: true }, req.user as never);
  }

  @Delete('platform/users/:id')
  removePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    return this.usersService.remove(id, req.user as never);
  }

  @Get('platform/settings')
  getSettings() {
    return this.platformService.getSettings();
  }

  @Patch('platform/settings')
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.platformService.updateSettings(body);
  }

  @Get('platform/roles')
  findPlatformRoles(@Headers('authorization') authorization?: string) {
    return this.usersService.findPlatformRoles(authorization);
  }

  @Post('platform/users')
  createPlatformUser(@Body() body: CreateUserDto, @Req() req: Request) {
    return this.usersService.create(
      {
        ...body,
        user_type: 'platform',
      } as unknown as Record<string, unknown>,
      req.user as never,
    );
  }

  @Get('platform/companies/:companyId/shops')
  findCompanyShops(@Param('companyId') companyId: string) {
    return this.platformService.findCompanyShops(companyId);
  }

  @Post('platform/companies/:companyId/shops')
  createShop(
    @Param('companyId') companyId: string,
    @Body() body: CreateShopDto,
  ) {
    return this.platformService.createShop(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Put('platform/companies/:companyId/shops/:shopId')
  updateShop(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
    @Body() body: UpdateShopDto,
  ) {
    return this.platformService.updateShop(
      companyId,
      shopId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Patch('platform/companies/:companyId/shops/:shopId/status')
  updateShopStatus(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
    @Body() body: UpdateEntityStatusDto,
  ) {
    return this.platformService.updateShopStatus(
      companyId,
      shopId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Delete('platform/companies/:companyId/shops/:shopId')
  removeShop(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
  ) {
    return this.platformService.removeShop(companyId, shopId);
  }

  @Get('platform/companies/:companyId/users')
  findCompanyUsers(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findCompanyUsersForPlatform(
      companyId,
      authorization,
    );
  }

  @Get('platform/companies/:companyId/users/:id')
  findCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      authorization,
    );
  }

  @Put('platform/companies/:companyId/users/:id')
  @Patch('platform/companies/:companyId/users/:id')
  async updateCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Req() req: Request,
  ) {
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      req.headers.authorization,
    );

    return this.usersService.update(
      id,
      {
        ...body,
        company_id: companyId,
        user_type: 'company',
      } as unknown as Record<string, unknown>,
      req.user as never,
    );
  }

  @Post('platform/companies/:companyId/users/:id/block')
  async blockCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      req.headers.authorization,
    );

    return this.usersService.updateStatus(
      id,
      { is_active: false },
      req.user as never,
    );
  }

  @Post('platform/companies/:companyId/users/:id/unblock')
  async unblockCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      req.headers.authorization,
    );

    return this.usersService.updateStatus(id, { is_active: true }, req.user as never);
  }

  @Delete('platform/companies/:companyId/users/:id')
  async removeCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      req.headers.authorization,
    );

    return this.usersService.remove(id, req.user as never);
  }

  @Post('platform/companies/:companyId/users')
  createCompanyUser(
    @Param('companyId') companyId: string,
    @Body() body: CreateUserDto,
    @Req() req: Request,
  ) {
    return this.usersService.create(
      {
        ...body,
        company_id: companyId,
        user_type: 'company',
      } as unknown as Record<string, unknown>,
      req.user as never,
    );
  }
}
