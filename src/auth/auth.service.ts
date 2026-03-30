import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { ShopLoginDto } from './dto/shop-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  shopLogin(dto: ShopLoginDto) {
    const shop = this.usersService.findShopByIdentifier(dto.shop_login);

    if (!shop) {
      throw new UnauthorizedException('Shop not found');
    }

    return {
      shop,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByPhoneNumber(dto.phone_number);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const effectiveBranchCode =
      this.usersService.findBranchCodeByShopIdentifier(dto.shop_login);

    if (!effectiveBranchCode) {
      throw new UnauthorizedException('Shop not found');
    }

    if (!this.usersService.userHasAccessToBranch(user, effectiveBranchCode)) {
      throw new UnauthorizedException(
        'This user does not have access to the requested shop',
      );
    }

    const payload = {
      sub: user.id,
      role: user.role,
      branchCode: effectiveBranchCode,
      phoneNumber: user.phoneNumber,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      token: accessToken,
      access_token: accessToken,
      user: await this.usersService.toAuthProfile({
        ...user,
        branchCode: effectiveBranchCode,
      }),
    };
  }

  async me(authorization?: string) {
    const payload = await this.verifyAccessToken(authorization);

    const user = await this.usersService.findByIdOrThrow(payload.sub);

    return this.usersService.toAuthProfile(user);
  }

  async setCurrentShop(shopId: string, authorization?: string) {
    const payload = await this.verifyAccessToken(authorization);

    return this.usersService.setCurrentShop(payload.sub, shopId);
  }

  private extractToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return authorization.slice('Bearer '.length).trim();
  }

  private async verifyAccessToken(authorization?: string) {
    const token = this.extractToken(authorization);

    try {
      return await this.jwtService.verifyAsync<{
        sub: number;
      }>(token);
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token expired');
      }

      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token');
      }

      throw error;
    }
  }
}
