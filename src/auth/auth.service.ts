import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { randomUUID, createHash } from 'crypto';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { extractAccessToken } from './access-token.util';
import { CompanyLoginDto } from './dto/company-login.dto';
import { LoginDto } from './dto/login.dto';
import { PlatformLoginDto } from './dto/platform-login.dto';

type AuthProfile = {
  user_type: string;
  company_id: string | null;
  current_shop_id: string | null;
  platform_role?: string | null;
  current_shop?: {
    branch_code?: string | null;
  } | null;
};

type AccessTokenPayload = {
  sub: number;
  role: string | null;
  userType: string;
  companyId: string | null;
  currentShopId: string | null;
  branchCode: string | null;
  phoneNumber: string;
  sessionId: string;
};

type RefreshTokenPayload = {
  sub: number;
  sessionId: string;
  type: 'refresh';
};

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private get db(): PrismaService {
    return this.prisma;
  }

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
    const tokens = await this.issueSessionTokens(
      user.id,
      this.buildAccessTokenPayload(user, authProfile, authProfile.platform_role),
    );

    return {
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      session_id: tokens.sessionId,
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
    const tokens = await this.issueSessionTokens(
      preparedUser.id,
      this.buildAccessTokenPayload(
        preparedUser,
        authProfile,
        preparedUser.crmRoleId,
      ),
    );

    return {
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      session_id: tokens.sessionId,
      user: authProfile,
    };
  }

  async refresh(body: Record<string, unknown>) {
    const refreshToken = this.extractRefreshToken(
      typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
    );
    const payload = await this.verifyRefreshToken(refreshToken);
    const session = await this.db.authSession.findUnique({
      where: {
        id: payload.sessionId,
      },
    });

    if (!session || session.userId !== payload.sub) {
      throw new UnauthorizedException('Session is invalid');
    }

    if (session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    if (session.refreshTokenHash !== this.hashToken(refreshToken)) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const preparedUser = await this.usersService.prepareAuthenticatedUser(
      payload.sub,
    );
    const authProfile = await this.usersService.toAuthProfile(preparedUser);
    const nextPayload = this.buildAccessTokenPayload(
      preparedUser,
      authProfile,
      preparedUser.userType === 'platform'
        ? preparedUser.platformRole
        : preparedUser.crmRoleId,
    );
    const tokens = await this.issueSessionTokens(preparedUser.id, nextPayload);

    await this.db.authSession.update({
      where: {
        id: session.id,
      },
      data: {
        revokedAt: new Date(),
        replacedById: tokens.sessionId,
      },
    });

    return {
      token: tokens.accessToken,
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      session_id: tokens.sessionId,
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
      !['platform_admin', 'superadmin'].includes(platformRole ?? '')
    ) {
      throw new ForbiddenException('Access denied');
    }

    return profile;
  }

  async logout(
    authorization?: string,
    body?: Record<string, unknown> | null,
  ) {
    const refreshToken =
      body && typeof body.refresh_token === 'string'
        ? body.refresh_token
        : undefined;
    const sessionId = await this.resolveSessionIdForLogout(
      authorization,
      refreshToken,
    );

    if (sessionId) {
      await this.db.authSession.updateMany({
        where: {
          id: sessionId,
          revokedAt: null,
        },
        data: {
          revokedAt: new Date(),
        },
      });
    }

    return {
      message: 'Выход выполнен успешно',
    };
  }

  async setCurrentShop(shopId: string, authorization?: string) {
    const payload = await this.verifyAccessToken(authorization);

    return this.usersService.setCurrentShop(payload.sub, shopId);
  }

  private buildAccessTokenPayload(
    user: {
      id: number;
      userType: string;
      platformRole?: string | null;
      crmRoleId?: string | null;
      phoneNumber: string;
    },
    authProfile: AuthProfile,
    role: string | null | undefined,
  ) {
    return {
      sub: user.id,
      role: role ?? null,
      userType: authProfile.user_type,
      companyId: authProfile.company_id,
      currentShopId: authProfile.current_shop_id,
      branchCode: authProfile.current_shop?.branch_code ?? null,
      phoneNumber: user.phoneNumber,
    };
  }

  private async issueSessionTokens(
    userId: number,
    payload: Omit<AccessTokenPayload, 'sessionId'>,
  ) {
    const sessionId = randomUUID();
    const refreshToken = await this.signRefreshToken({
      sub: userId,
      sessionId,
      type: 'refresh',
    });
    const refreshPayload = this.decodeTokenPayload(refreshToken);

    if (!refreshPayload?.exp) {
      throw new UnauthorizedException('Failed to issue refresh token');
    }

    await this.db.authSession.create({
      data: {
        id: sessionId,
        userId,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(refreshPayload.exp * 1000),
      },
    });

    const accessToken = await this.jwtService.signAsync({
      ...payload,
      sessionId,
    });

    return {
      sessionId,
      accessToken,
      refreshToken,
    };
  }

  private async verifyAccessToken(authorization?: string) {
    const token = extractAccessToken(authorization);

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(
        token,
      );

      if (payload.sessionId) {
        await this.usersService.assertAuthSessionIsActive(
          payload.sessionId,
          payload.sub,
        );
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Ссессия истекла');
      }

      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Неккоректный токен');
      }

      throw error;
    }
  }

  private async verifyRefreshToken(token: string) {
    try {
      const payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(
        token,
        {
          secret: this.getRefreshSecret(),
        },
      );

      if (payload.type !== 'refresh' || !payload.sessionId) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      return payload;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Refresh session expired');
      }

      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      throw error;
    }
  }

  private async signRefreshToken(payload: RefreshTokenPayload) {
    return this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: this.getRefreshExpiresIn() as never,
    });
  }

  private async resolveSessionIdForLogout(
    authorization?: string,
    refreshTokenValue?: string,
  ) {
    if (refreshTokenValue?.trim()) {
      const refreshToken = this.extractRefreshToken(refreshTokenValue);
      const payload = await this.verifyRefreshToken(refreshToken);
      return payload.sessionId;
    }

    if (!authorization?.trim()) {
      return null;
    }

    const payload = await this.verifyAccessToken(authorization);
    return payload.sessionId ?? null;
  }

  private extractRefreshToken(value?: string) {
    const token = value?.trim();

    if (!token) {
      throw new UnauthorizedException('Refresh token is required');
    }

    return token;
  }

  private hashToken(value: string) {
    return createHash('sha256').update(value).digest('hex');
  }

  private decodeTokenPayload(token: string) {
    const payload = this.jwtService.decode(token);
    return payload && typeof payload === 'object'
      ? (payload as { exp?: number })
      : null;
  }

  private getRefreshSecret() {
    return (
      this.configService.get<string>('JWT_REFRESH_SECRET') ??
      this.configService.get<string>('JWT_SECRET') ??
      ''
    );
  }

  private getRefreshExpiresIn() {
    return this.configService.get<string>('JWT_REFRESH_EXPIRES_IN') ?? '30d';
  }
}
