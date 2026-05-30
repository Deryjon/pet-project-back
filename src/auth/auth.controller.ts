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

  @Post('platform/auth/login')
  platformAuthLogin(@Body() dto: PlatformLoginDto) {
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

  @Get('platform/auth/me')
  platformMe(@Headers('authorization') authorization?: string) {
    return this.authService.platformMe(authorization);
  }

  @Post('auth/refresh')
  refresh(@Body() body: Record<string, unknown>) {
    return this.authService.refresh(body);
  }

  @Post('auth/logout')
  logout(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authService.logout(authorization, body);
  }

  @Post('platform/auth/logout')
  platformLogout(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authService.logout(authorization, body);
  }

  @Patch('user/set-current-shop/:shopId')
  setCurrentShop(
    @Param('shopId') shopId: string,
    @Headers('authorization') authorization?: string,
  ) {
    return this.authService.setCurrentShop(shopId, authorization);
  }
}
