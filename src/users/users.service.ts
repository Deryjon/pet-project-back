import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

const SHOP_DEFINITIONS: Record<
  string,
  { id: string; shop_id: string; name: string; aliases?: string[] }
> = {
  main: {
    id: 'eaca6237-dc5c-4d4b-83e5-62a1eeb9a89a',
    shop_id: '11dc3536-e1ce-447b-aedb-ce3784c4b1ad',
    name: 'Samarqand Darvoza',
    aliases: ['2222'],
  },
  a: {
    id: '5a256a71-34c1-42a0-a84d-1061bf84eb6c',
    shop_id: 'be25385b-8db2-4d96-8240-f1bb6bb3420c',
    name: 'Globus Mall',
  },
};

const ROLE_DEFINITIONS: Record<
  string,
  { id: string; role_id: string; name: string }
> = {
  cashier: {
    id: 'baec941c-d610-4f2f-b35b-d21318d380f0',
    role_id: '32146a0a-c622-440b-ad8b-27f64e39aba8',
    name: 'Кассир',
  },
  admin: {
    id: 'ee70fb98-99fc-4d2e-8070-1f16361badfd',
    role_id: '70f2f91d-ff29-4c86-ae0c-ce0b181018e0',
    name: 'Админ',
  },
  store_manager: {
    id: '2afe4c1a-01bf-49b6-b1eb-af4f5b094302',
    role_id: 'ddf1c050-b868-4231-8a72-d9fa68e8f586',
    name: 'Управляющий магазина',
  },
  employee: {
    id: '14699b27-9b77-4ae5-be8c-ff798a9cd7f1',
    role_id: '32146a0a-c622-440b-ad8b-27f64e39aba8',
    name: 'Кассир',
  },
};

const ALLOWED_LANGUAGES = new Set(['ru', 'uz', 'en']);
const ALLOWED_THEMES = new Set(['auto', 'light', 'dark']);
const ALLOWED_AVATAR_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
]);
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: {
        id: 'asc',
      },
    });

    return users.map((user) => this.toListItem(user));
  }

  findByPhoneNumber(phoneNumber: string) {
    return this.prisma.user.findUnique({
      where: { phoneNumber },
    });
  }

  async findByIdOrThrow(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findOneResponse(id: number) {
    const user = await this.findByIdOrThrow(id);

    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      birth_date: this.formatBirthDate(user.birthDate),
      phone_number: user.phoneNumber,
      role: user.role,
      branch_location: user.branchCode,
      branch_code: user.branchCode,
      is_active: user.isActive,
    };
  }

  async create(body: Record<string, unknown>) {
    const firstName = this.requireString(body.first_name, 'first_name');
    const lastName = this.requireString(body.last_name, 'last_name');
    const phoneNumber = this.requireString(body.phone_number, 'phone_number');
    const password = this.requireString(body.password, 'password');
    const role = this.optionalString(body.role) ?? 'employee';
    const branchCode = this.optionalString(body.branch_location);
    const birthDate = this.parseBirthDate(this.optionalString(body.birth_date));

    const existingUser = await this.findByPhoneNumber(phoneNumber);
    if (existingUser) {
      throw new BadRequestException(
        'User with this phone number already exists',
      );
    }

    const user = await this.prisma.user.create({
      data: {
        firstName,
        lastName,
        phoneNumber,
        password: await bcrypt.hash(password, 10),
        role,
        branchCode,
        birthDate,
      },
    });

    return this.findOneResponse(user.id);
  }

  async assertAdminAccess(authorization?: string) {
    const token = this.extractToken(authorization);

    let payload: { sub: number };

    try {
      payload = await this.jwtService.verifyAsync<{
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

    const user = await this.findByIdOrThrow(payload.sub);

    if (!this.hasGlobalLocationAccess(user.role)) {
      throw new ForbiddenException(
        'Only admin/owner/superadmin can manage employees',
      );
    }

    return user;
  }

  async update(id: number, body: Record<string, unknown>) {
    await this.findByIdOrThrow(id);

    const data: {
      firstName?: string;
      lastName?: string;
      birthDate?: Date | null;
      branchCode?: string | null;
      phoneNumber?: string;
      password?: string;
    } = {};

    if (body.first_name !== undefined) {
      data.firstName = this.requireString(body.first_name, 'first_name');
    }

    if (body.last_name !== undefined) {
      data.lastName = this.requireString(body.last_name, 'last_name');
    }

    if (body.branch_location !== undefined) {
      data.branchCode = this.optionalString(body.branch_location) ?? null;
    }

    if (body.birth_date !== undefined) {
      data.birthDate =
        this.parseBirthDate(this.optionalString(body.birth_date)) ?? null;
    }

    if (body.phone_number !== undefined) {
      data.phoneNumber = this.requireString(body.phone_number, 'phone_number');
    }

    if (body.password !== undefined) {
      const password = this.requireString(body.password, 'password');
      data.password = await bcrypt.hash(password, 10);
    }

    await this.prisma.user.update({
      where: { id },
      data,
    });

    return this.findOneResponse(id);
  }

  async getProfile(authorization?: string) {
    const user = await this.getAuthenticatedUser(authorization);

    return this.toProfileResponse(user);
  }

  async updateProfile(
    authorization: string | undefined,
    body: Record<string, unknown>,
  ) {
    const user = await this.getAuthenticatedUser(authorization);
    const data: {
      firstName?: string;
      lastName?: string;
      language?: string;
      theme?: string;
    } = {};

    if (body.first_name !== undefined) {
      data.firstName = this.requireString(body.first_name, 'first_name');
    }

    if (body.last_name !== undefined) {
      data.lastName = this.requireString(body.last_name, 'last_name');
    }

    if (body.language !== undefined) {
      data.language = this.requireEnumValue(
        body.language,
        'language',
        ALLOWED_LANGUAGES,
      );
    }

    if (body.theme !== undefined) {
      data.theme = this.requireEnumValue(body.theme, 'theme', ALLOWED_THEMES);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id: user.id },
      data,
    });

    return {
      message: 'Profile updated',
      user: this.toProfileResponse(updatedUser),
    };
  }

  async updatePassword(
    authorization: string | undefined,
    body: Record<string, unknown>,
  ) {
    const user = await this.getAuthenticatedUser(authorization);
    const currentPassword = this.requireString(
      body.current_password,
      'current_password',
    );
    const newPassword = this.requireString(body.new_password, 'new_password');

    const isPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(newPassword, 10),
      },
    });

    return {
      message: 'Password updated',
    };
  }

  async uploadAvatar(
    authorization: string | undefined,
    file?: {
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    },
  ) {
    const user = await this.getAuthenticatedUser(authorization);

    if (!file) {
      throw new BadRequestException('Avatar file is required');
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Only jpg, jpeg and png files are allowed');
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      throw new BadRequestException('Avatar size must be 5MB or less');
    }

    const uploadsDirectory = join(process.cwd(), 'uploads', 'avatars');
    await fs.mkdir(uploadsDirectory, { recursive: true });

    await this.removeStoredAvatar(user.avatarUrl);

    const extension = extname(file.originalname).toLowerCase() || '.jpg';
    const fileName = `${user.id}-${randomUUID()}${extension}`;
    const filePath = join(uploadsDirectory, fileName);

    await fs.writeFile(filePath, file.buffer);

    const avatarUrl = this.buildAvatarUrl(fileName);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl,
      },
    });

    return {
      message: 'Avatar uploaded',
      avatar_url: avatarUrl,
    };
  }

  async removeAvatar(authorization?: string) {
    const user = await this.getAuthenticatedUser(authorization);

    await this.removeStoredAvatar(user.avatarUrl);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        avatarUrl: null,
      },
    });

    return {
      message: 'Avatar removed',
      avatar_url: null,
    };
  }

  async toAuthProfile(user: User) {
    const name = `${user.firstName} ${user.lastName}`.trim();
    const hasGlobalLocationAccess = this.hasGlobalLocationAccess(user.role);
    const locationCodes = hasGlobalLocationAccess
      ? await this.findAllLocationCodes()
      : user.branchCode
        ? [user.branchCode]
        : [];
    const shops = locationCodes.map((code) => this.toShopItem(code));
    const currentShop = user.branchCode
      ? this.toShopItem(user.branchCode)
      : null;
    const roles = this.resolveRoles(user.role, hasGlobalLocationAccess);

    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      full_name: name,
      birth_date: this.formatIsoDate(user.birthDate),
      birth_year: user.birthDate?.getUTCFullYear() ?? null,
      phone_number: user.phoneNumber,
      avatar_url: user.avatarUrl,
      is_active: user.isActive,
      role: roles[0]?.role ?? null,
      roles,
      current_shop_id: currentShop?.shop_id ?? null,
      current_shop: currentShop,
      shops,
    };
  }

  async setCurrentShop(userId: number, shopId: string) {
    const user = await this.findByIdOrThrow(userId);
    const targetBranchCode = this.findBranchCodeByShopId(shopId);

    if (!targetBranchCode) {
      throw new NotFoundException('Shop not found');
    }

    if (
      !this.hasGlobalLocationAccess(user.role) &&
      user.branchCode !== targetBranchCode
    ) {
      throw new BadRequestException(
        'This user does not have access to the requested shop',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        branchCode: targetBranchCode,
      },
    });

    return {
      message: shopId,
    };
  }

  private toListItem(user: User) {
    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      phone_number: user.phoneNumber,
      role: user.role,
      branch_location: user.branchCode,
      is_active: user.isActive,
    };
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }

    return value.trim();
  }

  private requireEnumValue(
    value: unknown,
    field: string,
    allowedValues: Set<string>,
  ) {
    const normalizedValue = this.requireString(value, field);

    if (!allowedValues.has(normalizedValue)) {
      throw new BadRequestException(`${field} has an invalid value`);
    }

    return normalizedValue;
  }

  private optionalString(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  private parseBirthDate(value?: string) {
    if (!value) {
      return undefined;
    }

    const match = /^(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})$/.exec(
      value,
    );
    if (!match?.groups) {
      throw new BadRequestException('birth_date must be in DD.MM.YYYY format');
    }

    const day = Number(match.groups.day);
    const month = Number(match.groups.month);
    const year = Number(match.groups.year);
    const date = new Date(Date.UTC(year, month - 1, day));

    if (
      Number.isNaN(date.getTime()) ||
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      throw new BadRequestException('birth_date is not a valid calendar date');
    }

    return date;
  }

  private formatBirthDate(value: Date | null) {
    if (!value) {
      return null;
    }

    const day = value.getUTCDate().toString().padStart(2, '0');
    const month = (value.getUTCMonth() + 1).toString().padStart(2, '0');
    const year = value.getUTCFullYear();

    return `${day}.${month}.${year}`;
  }

  private async findAllLocationCodes() {
    const [userLocations, saleLocations, stockLocations] = await Promise.all([
      this.prisma.user.findMany({
        where: {
          branchCode: {
            not: null,
          },
        },
        select: {
          branchCode: true,
        },
        distinct: ['branchCode'],
      }),
      this.prisma.sale.findMany({
        where: {
          branchCode: {
            not: null,
          },
        },
        select: {
          branchCode: true,
        },
        distinct: ['branchCode'],
      }),
      this.prisma.productStock.findMany({
        select: {
          branchCode: true,
        },
        distinct: ['branchCode'],
      }),
    ]);

    return [
      ...new Set(
        [
          ...userLocations.map((item) => item.branchCode),
          ...saleLocations.map((item) => item.branchCode),
          ...stockLocations.map((item) => item.branchCode),
        ]
          .filter(
            (branchCode): branchCode is string =>
              typeof branchCode === 'string',
          )
          .map((branchCode) => this.normalizeLocationCode(branchCode)),
      ),
    ].sort();
  }

  private hasGlobalLocationAccess(role: string) {
    return ['admin', 'owner', 'superadmin'].includes(role.trim().toLowerCase());
  }

  private resolveRoles(role: string, hasGlobalLocationAccess: boolean) {
    if (hasGlobalLocationAccess) {
      return [
        this.toRoleItem('cashier'),
        this.toRoleItem('admin'),
        this.toRoleItem('store_manager'),
      ];
    }

    const normalizedRole = role.trim().toLowerCase();
    return [
      this.toRoleItem(
        normalizedRole in ROLE_DEFINITIONS ? normalizedRole : role,
      ),
    ];
  }

  private toRoleItem(roleCode: string) {
    const definition =
      ROLE_DEFINITIONS[roleCode] ??
      ({
        id: roleCode,
        role_id: roleCode,
        name: roleCode,
      } satisfies { id: string; role_id: string; name: string });

    return {
      id: definition.id,
      role_id: definition.role_id,
      role: {
        name: definition.name,
      },
    };
  }

  private toShopItem(locationCode: string) {
    const normalizedLocationCode = this.normalizeLocationCode(locationCode);
    const definition = SHOP_DEFINITIONS[normalizedLocationCode];

    if (definition) {
      return {
        id: definition.id,
        shop_id: definition.shop_id,
        shop: {
          name: definition.name,
        },
      };
    }

    return {
      id: normalizedLocationCode,
      shop_id: normalizedLocationCode,
      shop: {
        name: normalizedLocationCode,
      },
    };
  }

  private findBranchCodeByShopId(shopId: string) {
    return this.resolveShopDefinition(shopId)?.branchCode;
  }

  private normalizeLocationCode(locationCode: string) {
    return (
      this.resolveShopDefinition(locationCode)?.branchCode ??
      locationCode.trim()
    );
  }

  private resolveShopDefinition(locationIdentifier: string) {
    const normalizedIdentifier = locationIdentifier.trim();
    const loweredIdentifier = normalizedIdentifier.toLowerCase();
    const match = Object.entries(SHOP_DEFINITIONS).find(
      ([branchCode, definition]) => {
        const aliases = definition.aliases ?? [];

        return (
          branchCode === normalizedIdentifier ||
          definition.id === normalizedIdentifier ||
          definition.shop_id === normalizedIdentifier ||
          definition.name.toLowerCase() === loweredIdentifier ||
          aliases.includes(normalizedIdentifier)
        );
      },
    );

    if (!match) {
      return undefined;
    }

    const [branchCode, definition] = match;
    return {
      branchCode,
      definition,
    };
  }

  private extractToken(authorization?: string) {
    if (!authorization?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    return authorization.slice('Bearer '.length).trim();
  }

  private formatIsoDate(value: Date | null) {
    if (!value) {
      return null;
    }

    return value.toISOString().slice(0, 10);
  }

  private async getAuthenticatedUser(authorization?: string) {
    const token = this.extractToken(authorization);

    try {
      const payload = await this.jwtService.verifyAsync<{
        sub: number;
      }>(token);

      return this.findByIdOrThrow(payload.sub);
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

  private toProfileResponse(user: User) {
    return {
      id: user.id,
      first_name: user.firstName,
      last_name: user.lastName,
      full_name: `${user.firstName} ${user.lastName}`.trim(),
      phone_number: user.phoneNumber,
      avatar_url: user.avatarUrl,
      language: user.language,
      theme: user.theme,
    };
  }

  private buildAvatarUrl(fileName: string) {
    const origin =
      process.env.APP_URL?.trim() ||
      `http://localhost:${process.env.PORT?.trim() || '3001'}`;

    return `${origin}/uploads/avatars/${fileName}`;
  }

  private async removeStoredAvatar(avatarUrl: string | null) {
    if (!avatarUrl) {
      return;
    }

    const uploadsSegment = '/uploads/avatars/';
    const avatarPathIndex = avatarUrl.indexOf(uploadsSegment);

    if (avatarPathIndex === -1) {
      return;
    }

    const fileName = avatarUrl.slice(avatarPathIndex + uploadsSegment.length);
    if (!fileName) {
      return;
    }

    const filePath = join(process.cwd(), 'uploads', 'avatars', fileName);

    try {
      await fs.unlink(filePath);
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }

      throw error;
    }
  }
}
