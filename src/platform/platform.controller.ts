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
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { PlatformService } from './platform.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { UpdateShopDto } from './dto/update-shop.dto';
import { UpdateEntityStatusDto } from './dto/update-entity-status.dto';
import { UsersService } from '../users/users.service';

@Controller()
export class PlatformController {
  constructor(
    private readonly platformService: PlatformService,
    private readonly usersService: UsersService,
  ) {}

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

  @Delete('platform/companies/:companyId')
  async removeCompany(
    @Param('companyId') companyId: string,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertPlatformAdminAccess(authorization);

    return this.platformService.removeCompany(companyId);
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

  @Post('platform/companies/:companyId/users')
  async createCompanyUser(
    @Param('companyId') companyId: string,
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertPlatformAdminAccess(
      authorization,
    );

    return this.usersService.create(
      {
        ...body,
        company_id: companyId,
        user_type: 'company',
      } as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Get('platform/users')
  findPlatformUsers(@Headers('authorization') authorization?: string) {
    return this.usersService.findPlatformUsers(authorization);
  }

  @Post('platform/users')
  async createPlatformUser(
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertPlatformAdminAccess(
      authorization,
    );

    return this.usersService.create(
      {
        ...body,
        user_type: 'platform',
      } as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Get('platform/users/:id')
  findPlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findPlatformManagedUser(id, authorization);
  }

  @Put('platform/users/:id')
  async updatePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertPlatformAdminAccess(
      authorization,
    );

    return this.usersService.update(
      id,
      body as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Delete('platform/users/:id')
  async removePlatformUser(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertPlatformAdminAccess(
      authorization,
    );

    return this.usersService.remove(id, actor);
  }
}
