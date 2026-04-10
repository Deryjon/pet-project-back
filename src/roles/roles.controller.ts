import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller()
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('v2/role')
  create(
    @Body() body: CreateRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.create(
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Get('v2/role')
  findAll(@Headers('authorization') authorization?: string) {
    return this.rolesService.findAll(authorization);
  }

  @Get('v2/role/:id')
  findOne(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.findOne(id, authorization);
  }

  @Get('v2/role/:id/permissions')
  getPermissions(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.getPermissions(id, authorization);
  }

  @Put('v2/role/:id')
  update(
    @Param('id') id: string,
    @Body() body: UpdateRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.update(
      id,
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Put('v2/role/:id/permissions')
  updatePermissions(
    @Param('id') id: string,
    @Body() body: UpdateRolePermissionsDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.updatePermissions(
      id,
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Delete('v2/role/:id')
  remove(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.rolesService.remove(id, authorization);
  }
}
