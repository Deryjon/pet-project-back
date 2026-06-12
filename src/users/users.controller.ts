import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateCompanyRoleDto } from './dto/create-company-role.dto';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateCompanyRoleDto } from './dto/update-company-role.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  findAll(@Headers('authorization') authorization?: string) {
    return this.usersService.findAll(authorization);
  }

  @Get('user')
  findBillzUsers(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findBillzUsers(query, authorization);
  }

  @Get('v1/user')
  findBillzV1Users(
    @Query() query: Record<string, string | undefined>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findBillzUsers(query, authorization);
  }

  @Get('v2/user/:id/permissions')
  @Header('Cache-Control', 'no-store')
  @Header('Pragma', 'no-cache')
  getV2UserPermissions(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.getPermissionsResponse(id, authorization);
  }

  @Post('users/add')
  async add(
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    return this.usersService.create(
      body as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Get('users/:id')
  findOne(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.findOneResponse(id, authorization);
  }

  @Put('users/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    return this.usersService.update(
      id,
      body as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Patch('users/:id/status')
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    return this.usersService.updateStatus(
      id,
      body as unknown as Record<string, unknown>,
      actor,
    );
  }

  @Patch('users/:id/restore')
  async restore(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    return this.usersService.restore(id, actor);
  }

  @Delete('users/:id')
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Headers('authorization') authorization?: string,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    return this.usersService.remove(id, actor);
  }

  @Get('user/profile')
  profile(@Headers('authorization') authorization?: string) {
    return this.usersService.getProfile(authorization);
  }

  @Get('company/roles')
  findCompanyRoles(@Headers('authorization') authorization?: string) {
    return this.usersService.findCompanyRoles(authorization);
  }

  @Post('company/roles')
  createCompanyRole(
    @Body() body: CreateCompanyRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.createCompanyRole(
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Put('company/roles/:id')
  updateCompanyRole(
    @Param('id') id: string,
    @Body() body: UpdateCompanyRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.updateCompanyRole(
      id,
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Patch('company/roles/:id/status')
  updateCompanyRoleStatus(
    @Param('id') id: string,
    @Body() body: UpdateCompanyRoleDto,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.updateCompanyRole(
      id,
      body as unknown as Record<string, unknown>,
      authorization,
    );
  }

  @Delete('company/roles/:id')
  removeCompanyRole(
    @Param('id') id: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.usersService.removeCompanyRole(id, authorization);
  }

  @Patch('user/profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdateProfileDto,
  ) {
    return this.usersService.updateProfile(
      authorization,
      body as unknown as Record<string, unknown>,
    );
  }

  @Patch('user/profile/password')
  updatePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: UpdatePasswordDto,
  ) {
    return this.usersService.updatePassword(
      authorization,
      body as unknown as Record<string, unknown>,
    );
  }

  @Post('user/profile/avatar')
  @UseInterceptors(
    FileInterceptor('avatar', {
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (allowed.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Only JPEG, PNG and WebP images are allowed'), false);
        }
      },
    }),
  )
  uploadAvatar(
    @Headers('authorization') authorization: string | undefined,
    @UploadedFile()
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    return this.usersService.uploadAvatar(authorization, file);
  }

  @Delete('user/profile/avatar')
  removeAvatar(@Headers('authorization') authorization?: string) {
    return this.usersService.removeAvatar(authorization);
  }
}
