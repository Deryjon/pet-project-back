import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@Controller()
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
