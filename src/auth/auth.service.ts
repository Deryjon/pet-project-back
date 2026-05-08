import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { UsersService } from '../users/users.service';
import { extractAccessToken } from './access-token.util';
import { CompanyLoginDto } from './dto/company-login.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async companyLogin(dto: CompanyLoginDto) {
    const company = await this.usersService.findCompanyByIdentifier(
      dto.company_login,
    );

    if (!company) {
      throw new UnauthorizedException('Company not found');
    }

    return {
      company,
    };
  }

  async platformLogin(dto: PlatformLoginDto) {
    const user = await this.usersService.findPlatformUserByPhoneNumber(
      dto.phone_number,
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.usersService.assertUserCanAuthenticate(user);
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const authProfile = await this.usersService.toAuthProfile(user);
    const payload = {
      sub: user.id,
      role: user.platformRole,
      userType: authProfile.user_type,
      companyId: null,
      currentShopId: null,
      branchCode: null,
      phoneNumber: user.phoneNumber,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      token: accessToken,
      access_token: accessToken,
      user: authProfile,
    };
  }

  async login(dto: LoginDto) {
    const companyId = await this.usersService.findCompanyIdByIdentifier(
      dto.company_login,
    );

    if (!companyId) {
      throw new UnauthorizedException('Company not found');
    }

    const user = await this.usersService.findByPhoneNumberAndCompany(
      dto.phone_number,
      companyId,
    );

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    await this.usersService.assertUserCanAuthenticate(user);
    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    const preparedUser =
      await this.usersService.prepareAuthenticatedUserForLogin(
        user.id,
        companyId,
      );
    const authProfile = await this.usersService.toAuthProfile(preparedUser);

    const payload = {
      sub: preparedUser.id,
      role: preparedUser.crmRoleId,
      userType: authProfile.user_type,
      companyId: authProfile.company_id,
      currentShopId: authProfile.current_shop_id,
      branchCode: authProfile.current_shop?.branch_code ?? null,
      phoneNumber: preparedUser.phoneNumber,
    };
    const accessToken = await this.jwtService.signAsync(payload);

    return {
      token: accessToken,
      access_token: accessToken,
      user: authProfile,
    };
  }

  async me(authorization?: string) {
    const payload = await this.verifyAccessToken(authorization);
    const user = await this.usersService.prepareAuthenticatedUser(payload.sub);
    return this.usersService.toAuthProfile(user);
  }

  async platformMe(authorization?: string) {
    const profile = await this.me(authorization);

    const platformRole = profile.platform_role ?? profile.role_code;
    if (
      profile.user_type !== 'platform' ||
      !['platform_admin', 'superadmin'].includes(platformRole)
    ) {
      throw new ForbiddenException('Only platform admin can access platform');
    }

    return profile;
  }

  logout() {
    return {
      message: 'Logged out',
    };
  }

  async setCurrentShop(shopId: string, authorization?: string) {
    const payload = await this.verifyAccessToken(authorization);

    return this.usersService.setCurrentShop(payload.sub, shopId);
  }

  private async verifyAccessToken(authorization?: string) {
    const token = extractAccessToken(authorization);

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
