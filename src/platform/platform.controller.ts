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
} from '@nestjs/common';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { UpdateUserDto } from '../users/dto/update-user.dto';
import { UsersService } from '../users/users.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateEntityStatusDto } from './dto/update-entity-status.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { PlatformService } from './platform.service';

@Controller()
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly usersService: UsersService,
  ) {}

  @Get('platform/dashboard/stats')
  async getDashboardStats(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.getDashboardStats();
  }

  @Get('platform/companies')
  async findCompanies(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findCompanies();
  }

  @Get('platform/companies/:companyId')
  async findCompany(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findCompany(companyId);
  }

  @Post('platform/companies')
  async createCompany(
    @Body() body: CreateCompanyDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.createCompany(
      body as unknown as Record<string, unknown>,
    );
  }

  @Put('platform/companies/:companyId')
  @Patch('platform/companies/:companyId')
  async updateCompany(
    @Param('companyId') companyId: string,
    @Body() body: UpdateCompanyDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updateCompany(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Patch('platform/companies/:companyId/status')
  async updateCompanyStatus(
    @Param('companyId') companyId: string,
    @Body() body: UpdateEntityStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updateCompanyStatus(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Post('platform/companies/:companyId/block')
  async blockCompany(
    @Param('companyId') companyId: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.blockCompany(companyId, body, actor.id);
  }

  @Post('platform/companies/:companyId/unblock')
  async unblockCompany(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.unblockCompany(companyId, actor.id);
  }

  @Delete('platform/companies/:companyId')
  async removeCompany(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.removeCompany(companyId);
  }

  @Get('platform/subscriptions')
  async findSubscriptions(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findSubscriptions();
  }

  @Post('platform/subscriptions/:id/renew')
  async renewSubscription(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.renewSubscription(id, actor.id);
  }

  @Post('platform/subscriptions/check-expired')
  async checkExpiredSubscriptions(
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.checkExpiredSubscriptions(actor.id);
  }

  @Get('platform/payments')
  async findPayments(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findPayments();
  }

  @Post('platform/payments')
  async createPayment(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.createPayment(body, actor.id);
  }

  @Get('platform/plans')
  async findPlans(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findPlans();
  }

  @Post('platform/plans')
  async createPlan(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.createPlan(body);
  }

  @Patch('platform/plans/:id')
  async updatePlan(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updatePlan(id, body);
  }

  @Delete('platform/plans/:id')
  async removePlan(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
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
  async updatePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.update(
      id,
      body as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Post('platform/users/:id/block')
  async blockPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.update(id, { is_active: false }, actor);
  }

  @Post('platform/users/:id/unblock')
  async unblockPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.update(id, { is_active: true }, actor);
  }

  @Delete('platform/users/:id')
  async removePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.remove(id, actor);
  }

  @Get('platform/settings')
  async getSettings(@Headers('authorization') authorization?: string) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.getSettings();
  }

  @Patch('platform/settings')
  async updateSettings(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updateSettings(body);
  }

  @Get('platform/roles')
  findPlatformRoles(@Headers('authorization') authorization?: string) {
    return this.usersService.findPlatformRoles(authorization);
  }

  @Post('platform/users')
  async createPlatformUser(
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.create(
      {
        ...body,
        user_type: 'platform',
      } as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Get('platform/companies/:companyId/shops')
  async findCompanyShops(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.findCompanyShops(companyId);
  }

  @Post('platform/companies/:companyId/shops')
  async createShop(
    @Param('companyId') companyId: string,
    @Body() body: CreateShopDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.createShop(
      companyId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Put('platform/companies/:companyId/shops/:shopId')
  async updateShop(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
    @Body() body: UpdateShopDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updateShop(
      companyId,
      shopId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Patch('platform/companies/:companyId/shops/:shopId/status')
  async updateShopStatus(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
    @Body() body: UpdateEntityStatusDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.updateShopStatus(
      companyId,
      shopId,
      body as unknown as Record<string, unknown>,
    );
  }

  @Delete('platform/companies/:companyId/shops/:shopId')
  async removeShop(
    @Param('companyId') companyId: string,
    @Param('shopId') shopId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);
    return this.platformService.removeShop(companyId, shopId);
  }

  @Get('platform/companies/:companyId/users')
  async findCompanyUsers(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findCompanyUsersForPlatform(
      companyId,
      authorization,
    );
  }

  @Get('platform/companies/:companyId/users/:id')
  async findCompanyUser(
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
    @Headers('authorization') authorization?: string,
  ) {
    console.log('PlatformController.updateCompanyUser authorization =', {
      companyId,
      id,
      authorization: authorization ?? null,
    });
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      authorization,
    );

    return this.usersService.update(
      id,
      {
        ...body,
        company_id: companyId,
        user_type: 'company',
      } as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Post('platform/companies/:companyId/users/:id/block')
  async blockCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      authorization,
    );

    return this.usersService.updateStatus(
      id,
      { is_active: false },
      actor,
    );
  }

  @Post('platform/companies/:companyId/users/:id/unblock')
  async unblockCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      authorization,
    );

    return this.usersService.updateStatus(id, { is_active: true }, actor);
  }

  @Delete('platform/companies/:companyId/users/:id')
  async removeCompanyUser(
    @Param('companyId') companyId: string,
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    await this.usersService.findCompanyManagedUserForPlatform(
      companyId,
      id,
      authorization,
    );

    return this.usersService.remove(id, actor);
  }

  @Post('platform/companies/:companyId/users')
  async createCompanyUser(
    @Param('companyId') companyId: string,
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor =
      await this.usersService.assertPlatformAdminAccess(authorization);
    return this.usersService.create(
      {
        ...body,
        company_id: companyId,
        user_type: 'company',
      } as unknown as Record<string, unknown>,
      actor,
    );
  }
}
