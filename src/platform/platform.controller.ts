import { Body, Controller, Get, Headers, Param, Post } from '@nestjs/common';
import { CreateUserDto } from '../users/dto/create-user.dto';
import { CreateCompanyDto } from './dto/create-company.dto';
import { CreateShopDto } from './dto/create-shop.dto';
import { PlatformService } from './platform.service';
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
}
