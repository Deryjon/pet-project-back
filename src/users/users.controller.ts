import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  findAll() {
    return this.usersService.findAll();
  }

  @Post('users/add')
  async add(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertAdminAccess(authorization);

    return this.usersService.create(body);
  }

  @Get('users/:id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOneResponse(Number(id));
  }

  @Put('users/:id')
  async update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertAdminAccess(authorization);

    return this.usersService.update(Number(id), body);
  }

  @Get('user/profile')
  profile(@Headers('authorization') authorization?: string) {
    return this.usersService.getProfile(authorization);
  }

  @Patch('user/profile')
  updateProfile(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.updateProfile(authorization, body);
  }

  @Patch('user/profile/password')
  updatePassword(
    @Headers('authorization') authorization: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.usersService.updatePassword(authorization, body);
  }

  @Post('user/profile/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
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
