import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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
    @Body() body: CreateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertAdminAccess(authorization);

    return this.usersService.create(body as unknown as Record<string, unknown>);
  }

  @Get('users/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.usersService.findOneResponse(id);
  }

  @Put('users/:id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateUserDto,
    @Headers('authorization') authorization?: string,
  ) {
    await this.usersService.assertAdminAccess(authorization);

    return this.usersService.update(
      id,
      body as unknown as Record<string, unknown>,
    );
  }

  @Get('user/profile')
  profile(@Headers('authorization') authorization?: string) {
    return this.usersService.getProfile(authorization);
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
