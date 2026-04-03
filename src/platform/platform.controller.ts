import { Body, Controller, Headers, Param, Post } from '@nestjs/common';
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
}
