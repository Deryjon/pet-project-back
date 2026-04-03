import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CompanyLoginDto } from './dto/company-login.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('auth/company-login')
  companyLogin(@Body() dto: CompanyLoginDto) {
    return this.authService.companyLogin(dto);
  }

  @Post('auth/platform-login')
  platformLogin(@Body() dto: PlatformLoginDto) {
    return this.authService.platformLogin(dto);
  }

  @Post('auth/login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Get('auth/me')
  me(@Headers('authorization') authorization?: string) {
    return this.authService.me(authorization);
  }

  @Patch('user/set-current-shop/:shopId')
  setCurrentShop(
    @Param('shopId') shopId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authService.setCurrentShop(shopId, authorization);
  }
}
