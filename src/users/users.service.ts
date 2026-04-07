import {
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { JsonWebTokenError, TokenExpiredError } from 'jsonwebtoken';
import { extname, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

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
  owner: {
    id: '7c88f602-449e-487f-bd6b-cf7d3e01f072',
    role_id: 'owner',
    name: 'Owner',
  },
  store_manager: {
    id: '2afe4c1a-01bf-49b6-b1eb-af4f5b094302',
    role_id: 'ddf1c050-b868-4231-8a72-d9fa68e8f586',
    name: 'Управляющий магазином',
  },
  employee: {
    id: '14699b27-9b77-4ae5-be8c-ff798a9cd7f1',
    role_id: '32146a0a-c622-440b-ad8b-27f64e39aba8',
    name: 'Сотрудник',
  },
  platform_admin: {
    id: 'df1d8bf5-97ab-4ab6-a77e-bf0efcb44db7',
    role_id: 'platform_admin',
    name: 'Админ платформы',
  },
  support: {
    id: '8c1dc25f-9a41-4b6e-b8ae-f5a11d0c6bd2',
    role_id: 'support',
    name: 'Поддержка',
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
const PLATFORM_ADMIN_ROLES = new Set(['platform_admin', 'superadmin']);
const COMPANY_ADMIN_ROLES = new Set(['admin', 'owner', 'superadmin']);
const DEFAULT_COMPANY_ROLES = [
  { code: 'owner', name: 'Owner', isSystem: true },
  { code: 'admin', name: 'Admin', isSystem: true },
  { code: 'store_manager', name: 'Store manager', isSystem: true },
  { code: 'cashier', name: 'Cashier', isSystem: true },
  { code: 'employee', name: 'Employee', isSystem: true },
] as const;

type UserWithRelations = any;
type CompanyRoleRecord = {
  id: string;
  companyId: string;
  code: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  private getCompanyRoleDelegate(db: any = this.db) {
    return db?.companyRole;
  }

  private hasCompanyRoleStorage(db: any = this.db) {
    return Boolean(this.getCompanyRoleDelegate(db));
  }

  private assertCompanyRoleStorageAvailable() {
    if (this.hasCompanyRoleStorage()) {
      return;
    }

    throw new InternalServerErrorException(
      'Company roles storage is unavailable. Run prisma generate and redeploy the service.',
    );
  }

  async findAll(authorization?: string) {
    const actor = await this.getAuthenticatedUser(authorization);
    const where = this.buildUserVisibilityWhere(actor);
    const users = await this.db.user.findMany({
      where,
      include: {
        company: true,
        currentShop: true,
        shopAccesses: {
          include: {
            shop: true,
          },
        },
      },
      orderBy: {
        id: 'asc',
      },
    });

    return Promise.all(users.map((user) => this.toListItem(user)));
  }

  async findPlatformUsers(authorization?: string) {
    await this.assertPlatformAdminAccess(authorization);

    const users = await this.db.user.findMany({
      where: {
        userType: 'platform',
      },
      include: this.userRelationsInclude(),
      orderBy: {
        id: 'asc',
      },
    });

    return Promise.all(users.map((user) => this.toListItem(user)));
  }

  async findCompanyUsersForPlatform(
    companyId: string,
    authorization?: string,
  ) {
    await this.assertPlatformAdminAccess(authorization);
    await this.ensureCompanyExists(companyId);

    const users = await this.db.user.findMany({
      where: {
        companyId,
        userType: 'company',
      },
      include: this.userRelationsInclude(),
      orderBy: {
        id: 'asc',
      },
    });

    return Promise.all(users.map((user) => this.toListItem(user)));
  }

  async findPlatformUserByPhoneNumber(phoneNumber: string) {
    const phoneNumberVariants = this.buildPhoneNumberLookupVariants(phoneNumber);

    return this.db.user.findFirst({
      where: {
        phoneNumber: {
          in: phoneNumberVariants,
        },
        userType: 'platform',
      },
      include: this.userRelationsInclude(),
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findByPhoneNumberAndCompany(phoneNumber: string, companyId: string) {
    const phoneNumberVariants = this.buildPhoneNumberLookupVariants(phoneNumber);

    return this.db.user.findFirst({
      where: {
        phoneNumber: {
          in: phoneNumberVariants,
        },
        companyId,
        userType: 'company',
      },
      include: this.userRelationsInclude(),
      orderBy: {
        id: 'asc',
      },
    });
  }

  async findCompanyByIdentifier(companyIdentifier: string) {
    const identifier = companyIdentifier.trim();
    const loweredIdentifier = identifier.toLowerCase();
    const company = await this.db.company.findFirst({
      where: {
        isActive: true,
        OR: [
          { id: identifier },
          { login: loweredIdentifier },
          { subdomain: loweredIdentifier },
        ],
      },
    });

    return company ? this.toCompanyItem(company) : null;
  }

  async findCompanyIdByIdentifier(companyIdentifier: string) {
    const company = await this.findCompanyByIdentifier(companyIdentifier);
    return company?.company_id ?? null;
  }

  async findCompanyRoles(authorization?: string) {
    const actor = await this.assertCompanyAdminAccess(authorization);
    await this.ensureDefaultCompanyRoles(actor.companyId);

    if (!this.hasCompanyRoleStorage()) {
      return DEFAULT_COMPANY_ROLES.map((role) =>
        this.toCompanyRoleItem({
          id: role.code,
          companyId: actor.companyId,
          code: role.code,
          name: role.name,
          isSystem: role.isSystem,
          isActive: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }),
      );
    }

    const roles = await this.db.companyRole.findMany({
      where: {
        companyId: actor.companyId,
      },
      orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
    });

    return roles.map((role: CompanyRoleRecord) => this.toCompanyRoleItem(role));
  }

  async createCompanyRole(
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const actor = await this.assertCompanyAdminAccess(authorization);
    this.assertCompanyRoleStorageAvailable();
    await this.ensureDefaultCompanyRoles(actor.companyId);

    const name = this.requireString(body.name, 'name');
    const requestedCode = this.optionalString(body.code);
    const code = requestedCode
      ? this.normalizeCompanyRoleCode(requestedCode, 'code')
      : await this.generateUniqueCompanyRoleCode(actor.companyId, name);

    const existingRole = await this.db.companyRole.findFirst({
      where: {
        companyId: actor.companyId,
        code,
      },
    });

    if (existingRole) {
      throw new BadRequestException('Role with this code already exists');
    }

    const role = await this.db.companyRole.create({
      data: {
        companyId: actor.companyId,
        code,
        name,
        isSystem: false,
        isActive: true,
      },
    });

    return this.toCompanyRoleItem(role);
  }

  async updateCompanyRole(
    roleId: string,
    body: Record<string, unknown>,
    authorization?: string,
  ) {
    const actor = await this.assertCompanyAdminAccess(authorization);
    this.assertCompanyRoleStorageAvailable();
    await this.ensureDefaultCompanyRoles(actor.companyId);

    const role = await this.findCompanyRoleByIdOrThrow(roleId, actor.companyId);
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      data.name = this.requireString(body.name, 'name');
    }

    if (body.is_active !== undefined) {
      data.isActive = this.requireBoolean(body.is_active, 'is_active');
    }

    if (body.code !== undefined) {
      const nextCode = this.normalizeCompanyRoleCode(body.code, 'code');

      if (role.isSystem && nextCode !== role.code) {
        throw new BadRequestException('System role code cannot be changed');
      }

      const duplicate = await this.db.companyRole.findFirst({
        where: {
          companyId: actor.companyId,
          code: nextCode,
          id: {
            not: role.id,
          },
        },
      });

      if (duplicate) {
        throw new BadRequestException('Role with this code already exists');
      }

      data.code = nextCode;
    }

    const nextCodeValue =
      typeof data.code === 'string' ? data.code : role.code;
    const deactivatingAdminRole =
      body.is_active === false && COMPANY_ADMIN_ROLES.has(role.code);

    const updatedRole = await this.db.$transaction(async (tx: any) => {
      if (deactivatingAdminRole) {
        const activeAdminRoles = await tx.companyRole.findMany({
          where: {
            companyId: actor.companyId,
            isActive: true,
            code: {
              in: [...COMPANY_ADMIN_ROLES],
            },
            id: {
              not: role.id,
            },
          },
        });

        if (!activeAdminRoles.length) {
          throw new BadRequestException(
            'Company must have at least one active admin role',
          );
        }
      }

      if (nextCodeValue !== role.code) {
        await tx.user.updateMany({
          where: {
            companyId: actor.companyId,
            userType: 'company',
            role: role.code,
          },
          data: {
            role: nextCodeValue,
          },
        });
      }

      return tx.companyRole.update({
        where: { id: role.id },
        data,
      });
    });

    return this.toCompanyRoleItem(updatedRole);
  }

  async removeCompanyRole(roleId: string, authorization?: string) {
    const actor = await this.assertCompanyAdminAccess(authorization);
    this.assertCompanyRoleStorageAvailable();
    await this.ensureDefaultCompanyRoles(actor.companyId);

    const role = await this.findCompanyRoleByIdOrThrow(roleId, actor.companyId);

    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }

    const assignedUsersCount = await this.db.user.count({
      where: {
        companyId: actor.companyId,
        userType: 'company',
        role: role.code,
      },
    });

    if (assignedUsersCount > 0) {
      throw new BadRequestException('Role is assigned to users');
    }

    await this.db.companyRole.delete({
      where: { id: role.id },
    });

    return {
      message: 'Company role deleted',
      role_id: role.id,
    };
  }

  async assertUserCanAuthenticate(user: UserWithRelations) {
    this.assertUserIsActive(user);

    if (user.userType === 'company') {
      this.assertCompanyMembershipIsActive(user);
      await this.assertCompanyRoleIsActive(user);
    }
  }

  async findByIdOrThrow(id: number) {
    const user = await this.db.user.findUnique({
      where: { id },
      include: this.userRelationsInclude(),
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findOneResponse(id: number, authorization?: string) {
    const actor = await this.getAuthenticatedUser(authorization);
    const user = await this.findByIdOrThrow(id);

    this.assertUserVisibleToActor(actor, user);
    const rolePayload = await this.resolveUserPrimaryRolePayload(user);

    return {
      id: user.id,
      user_type: user.userType,
      first_name: user.firstName,
      last_name: user.lastName,
      birth_date: this.formatBirthDate(user.birthDate),
      phone_number: user.phoneNumber,
      role: rolePayload.role_code,
      role_code: rolePayload.role_code,
      role_name: rolePayload.role_name,
      company_id: user.companyId,
      company: user.company ? this.toCompanyItem(user.company) : null,
      branch_location: user.branchCode,
      current_shop_id: user.currentShopId,
      current_shop: user.currentShop ? this.toShopItem(user.currentShop) : null,
      allowed_shop_ids: user.shopAccesses.map((access) => access.shopId),
      can_switch_shops: Boolean(user.canSwitchShops),
      is_active: user.isActive,
    };
  }

  async findPlatformManagedUser(id: number, authorization?: string) {
    await this.assertPlatformAdminAccess(authorization);

    return this.findOneResponse(id, authorization);
  }

  async create(body: Record<string, unknown>, actor?: UserWithRelations) {
    const firstName = this.requireString(body.first_name, 'first_name');
    const lastName = this.requireString(body.last_name, 'last_name');
    const phoneNumber = this.normalizePhoneNumber(
      this.requireString(body.phone_number, 'phone_number'),
    );
    const password = this.requireString(body.password, 'password');
    const userType = this.parseUserType(body.user_type);
    const birthDate = this.parseBirthDate(this.optionalString(body.birth_date));
    const normalizedRoleInput = this.optionalString(body.role);

    if (userType === 'platform') {
      const role = this.normalizePlatformRole(
        normalizedRoleInput ?? 'support',
        'role',
      );

      if (actor && !this.isPlatformAdmin(actor)) {
        throw new ForbiddenException('Only platform admin can create platform users');
      }

      const existingPlatformUser = await this.db.user.findFirst({
        where: {
          phoneNumber,
          userType: 'platform',
        },
      });

      if (existingPlatformUser) {
        throw new BadRequestException(
          'Platform user with this phone number already exists',
        );
      }

      const user = await this.db.user.create({
        data: {
          firstName,
          lastName,
          phoneNumber,
          password: await bcrypt.hash(password, 10),
          userType: 'platform',
          role,
          canSwitchShops: false,
          birthDate,
        },
        include: this.userRelationsInclude(),
      });

      return this.findOneResponse(user.id);
    }

    const companyId = await this.resolveCompanyIdForActor(body.company_id, actor);
    const role = await this.resolveCompanyUserRoleCode(
      companyId,
      normalizedRoleInput ?? 'employee',
    );
    const allowedShops = await this.resolveAllowedShopsForWrite(
      companyId,
      body.allowed_shop_ids,
      this.optionalString(body.current_shop_id) ??
        this.optionalString(body.branch_location),
    );
    const currentShop =
      await this.resolveCurrentShopForWrite(
        companyId,
        this.optionalString(body.current_shop_id) ??
          this.optionalString(body.branch_location),
        allowedShops,
      );
    const canSwitchShops =
      (this.optionalBoolean(body.can_switch_shops) ?? allowedShops.length > 1) &&
      allowedShops.length > 1;

    const existingCompanyUser = await this.db.user.findFirst({
      where: {
        phoneNumber,
        companyId,
        userType: 'company',
      },
    });

    if (existingCompanyUser) {
      throw new BadRequestException(
        'User with this phone number already exists in this company',
      );
    }

    const user = await this.db.user.create({
      data: {
        firstName,
        lastName,
        phoneNumber,
        password: await bcrypt.hash(password, 10),
        userType: 'company',
        role,
        companyId,
        branchCode: currentShop?.branchCode ?? null,
        currentShopId: currentShop?.id ?? null,
        canSwitchShops,
        birthDate,
        shopAccesses: allowedShops.length
          ? {
              createMany: {
                data: allowedShops.map((shop) => ({
                  shopId: shop.id,
                })),
              },
            }
          : undefined,
      },
      include: this.userRelationsInclude(),
    });

    return this.findOneResponse(user.id);
  }

  async assertPlatformAdminAccess(authorization?: string) {
    const user = await this.getAuthenticatedUser(authorization);

    if (!this.isPlatformAdmin(user)) {
      throw new ForbiddenException('Only platform admin can perform this action');
    }

    return user;
  }

  async assertAdminAccess(authorization?: string) {
    const user = await this.getAuthenticatedUser(authorization);

    if (this.isPlatformAdmin(user) || this.isCompanyAdmin(user)) {
      return user;
    }

    throw new ForbiddenException(
      'Only platform admin or company admin can manage employees',
    );
  }

  async assertCompanyAdminAccess(authorization?: string) {
    const user = await this.getAuthenticatedUser(authorization);

    if (!this.isCompanyAdmin(user) || !user.companyId) {
      throw new ForbiddenException('Only company admin can manage company roles');
    }

    return user;
  }

  async update(
    id: number,
    body: Record<string, unknown>,
    actor?: UserWithRelations,
  ) {
    const targetUser = await this.findByIdOrThrow(id);

    if (actor && !this.canManageUser(actor, targetUser)) {
      throw new ForbiddenException('You cannot manage this user');
    }

    const companyId =
      targetUser.userType === 'platform'
        ? null
        : await this.resolveCompanyIdForActor(
            body.company_id ?? targetUser.companyId,
            actor,
          );
    const companyChanged =
      targetUser.userType === 'company' &&
      companyId !== null &&
      targetUser.companyId !== companyId;
    const data: Prisma.UserUpdateInput = {};

    if (body.first_name !== undefined) {
      data.firstName = this.requireString(body.first_name, 'first_name');
    }

    if (body.last_name !== undefined) {
      data.lastName = this.requireString(body.last_name, 'last_name');
    }

    if (body.phone_number !== undefined) {
      data.phoneNumber = this.normalizePhoneNumber(
        this.requireString(body.phone_number, 'phone_number'),
      );
    }

    if (body.password !== undefined) {
      data.password = await bcrypt.hash(
        this.requireString(body.password, 'password'),
        10,
      );
    }

    if (body.birth_date !== undefined) {
      data.birthDate =
        this.parseBirthDate(this.optionalString(body.birth_date)) ?? null;
    }

    if (body.role !== undefined) {
      data.role =
        targetUser.userType === 'platform'
          ? this.normalizePlatformRole(body.role, 'role')
          : await this.resolveCompanyUserRoleCode(
              companyId ?? targetUser.companyId,
              body.role,
            );
    }

    if (body.can_switch_shops !== undefined) {
      data.canSwitchShops = this.optionalBoolean(body.can_switch_shops) ?? false;
    }

    if (targetUser.userType === 'company' && companyId) {
      data.company = {
        connect: {
          id: companyId,
        },
      };

      const allowedShops =
        body.allowed_shop_ids !== undefined ||
        body.current_shop_id !== undefined ||
        body.branch_location !== undefined ||
        companyChanged
          ? await this.resolveAllowedShopsForWrite(
              companyId,
              body.allowed_shop_ids ??
                (companyChanged
                  ? undefined
                  : targetUser.shopAccesses.map((access) => access.shopId)),
              this.optionalString(body.current_shop_id) ??
                this.optionalString(body.branch_location) ??
                (companyChanged ? undefined : targetUser.currentShopId),
            )
          : targetUser.shopAccesses.map((access) => access.shop);

      const currentShop =
        body.allowed_shop_ids !== undefined ||
        body.current_shop_id !== undefined ||
        body.branch_location !== undefined ||
        companyChanged
          ? await this.resolveCurrentShopForWrite(
              companyId,
              this.optionalString(body.current_shop_id) ??
                this.optionalString(body.branch_location) ??
                (companyChanged ? undefined : targetUser.currentShopId),
              allowedShops,
            )
          : targetUser.currentShop;

      data.currentShop = currentShop
        ? {
            connect: {
              id: currentShop.id,
            },
          }
        : { disconnect: true };
      data.branchCode = currentShop?.branchCode ?? null;
      data.canSwitchShops =
        (body.can_switch_shops !== undefined
          ? this.optionalBoolean(body.can_switch_shops) ?? false
          : targetUser.canSwitchShops) && allowedShops.length > 1;
      data.shopAccesses =
        body.allowed_shop_ids !== undefined ||
        body.current_shop_id !== undefined ||
        body.branch_location !== undefined
          ? {
              deleteMany: {},
              createMany: {
                data: allowedShops.map((shop) => ({
                  shopId: shop.id,
                })),
              },
            }
          : undefined;
    }

    if (data.phoneNumber) {
      const duplicate = await this.db.user.findFirst({
        where: {
          id: {
            not: id,
          },
          phoneNumber: data.phoneNumber,
          userType: targetUser.userType,
          companyId,
        },
      });

      if (duplicate) {
        throw new BadRequestException('User with this phone number already exists');
      }
    }

    await this.db.user.update({
      where: { id },
      data,
    });

    return this.findOneResponse(id);
  }

  async remove(id: number, actor?: UserWithRelations) {
    const targetUser = await this.findByIdOrThrow(id);

    if (actor && !this.canManageUser(actor, targetUser)) {
      throw new ForbiddenException('You cannot manage this user');
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.sale.updateMany({
        where: {
          userId: id,
        },
        data: {
          userId: null,
        },
      });

      await tx.user.delete({
        where: { id },
      });
    });

    return {
      message: 'User deleted',
      user_id: id,
    };
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
    const data: Prisma.UserUpdateInput = {};

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

    const updatedUser = await this.db.user.update({
      where: { id: user.id },
      data,
      include: this.userRelationsInclude(),
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

    await this.db.user.update({
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
    await this.db.user.update({
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

    await this.db.user.update({
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

  async prepareAuthenticatedUserForLogin(userId: number, companyId: string) {
    const user = await this.findByIdOrThrow(userId);

    if (user.userType !== 'company' || user.companyId !== companyId) {
      throw new UnauthorizedException('User does not belong to this company');
    }

    await this.assertUserCanAuthenticate(user);

    return this.prepareAuthenticatedUser(userId);
  }

  async prepareAuthenticatedUser(userId: number) {
    const user = await this.findByIdOrThrow(userId);

    await this.assertUserCanAuthenticate(user);

    if (user.userType === 'platform') {
      return user;
    }

    const companyId = user.companyId;
    if (!companyId) {
      throw new UnauthorizedException('Company user is missing company');
    }

    const availableShops = await this.resolveAvailableShopsForUser(user);
    const currentShop = this.resolveCurrentShop(user, availableShops);
    const canSwitchShops =
      Boolean(user.canSwitchShops) && availableShops.length > 1;

    const needsUpdate =
      user.currentShopId !== (currentShop?.id ?? null) ||
      user.branchCode !== (currentShop?.branchCode ?? null) ||
      user.canSwitchShops !== canSwitchShops;

    if (!needsUpdate) {
      return user;
    }

    return this.db.user.update({
      where: { id: user.id },
      data: {
        currentShopId: currentShop?.id ?? null,
        branchCode: currentShop?.branchCode ?? null,
        canSwitchShops,
      },
      include: this.userRelationsInclude(),
    });
  }

  async getRequestContext(authorization?: string) {
    const user = await this.prepareAuthenticatedUser(
      (await this.getAuthenticatedUser(authorization)).id,
    );
    const allowedShops =
      user.userType === 'company'
        ? await this.resolveAvailableShopsForUser(user)
        : [];

    return {
      userId: user.id,
      fullName: `${user.firstName} ${user.lastName}`.trim(),
      userType: user.userType,
      role: user.role,
      companyId: user.companyId,
      currentShopId: user.currentShopId,
      currentBranchCode: user.branchCode,
      allowedShopIds: allowedShops.map((shop) => shop.id),
      allowedBranchCodes: allowedShops.map((shop) => shop.branchCode),
      canSwitchShops: Boolean(user.canSwitchShops) && allowedShops.length > 1,
    };
  }

  async toAuthProfile(userInput: UserWithRelations) {
    const user = await this.prepareAuthenticatedUser(userInput.id);
    const roles = await this.resolveRoles(user.role, user.userType, user.companyId);

    if (user.userType === 'platform') {
      return {
        id: user.id,
        user_type: user.userType,
        first_name: user.firstName,
        last_name: user.lastName,
        full_name: `${user.firstName} ${user.lastName}`.trim(),
        birth_date: this.formatIsoDate(user.birthDate),
        birth_year: user.birthDate?.getUTCFullYear() ?? null,
        phone_number: user.phoneNumber,
        avatar_url: user.avatarUrl,
        is_active: user.isActive,
        role: roles[0]?.role ?? null,
        roles,
        company_id: null,
        company: null,
        can_switch_shops: false,
        current_shop_id: null,
        current_shop: null,
        shops: [],
      };
    }

    const shops = await this.resolveAvailableShopsForUser(user);

    return {
      id: user.id,
      user_type: user.userType,
      first_name: user.firstName,
      last_name: user.lastName,
      full_name: `${user.firstName} ${user.lastName}`.trim(),
      birth_date: this.formatIsoDate(user.birthDate),
      birth_year: user.birthDate?.getUTCFullYear() ?? null,
      phone_number: user.phoneNumber,
      avatar_url: user.avatarUrl,
      is_active: user.isActive,
      role: roles[0]?.role ?? null,
      roles,
      company_id: user.companyId,
      company: user.company ? this.toCompanyItem(user.company) : null,
      can_switch_shops: Boolean(user.canSwitchShops) && shops.length > 1,
      current_shop_id: user.currentShopId,
      current_shop: user.currentShop ? this.toShopItem(user.currentShop) : null,
      shops: shops.map((shop) => this.toShopItem(shop)),
    };
  }

  async setCurrentShop(userId: number, shopId: string) {
    const user = await this.prepareAuthenticatedUser(userId);

    if (user.userType !== 'company' || !user.companyId) {
      throw new BadRequestException('Platform user cannot switch shops');
    }

    const availableShops = await this.resolveAvailableShopsForUser(user);
    const targetShop = await this.findShopByIdentifierOrThrow(
      shopId,
      user.companyId,
    );

    if (!Boolean(user.canSwitchShops) || availableShops.length <= 1) {
      throw new BadRequestException(
        'This user is not allowed to switch shops',
      );
    }

    if (!availableShops.some((shop) => shop.id === targetShop.id)) {
      throw new BadRequestException(
        'This user does not have access to the requested shop',
      );
    }

    await this.db.user.update({
      where: { id: userId },
      data: {
        currentShopId: targetShop.id,
        branchCode: targetShop.branchCode,
      },
    });

    return {
      message: 'Current shop updated',
      current_shop_id: targetShop.id,
      current_shop: this.toShopItem(targetShop),
    };
  }

  private userRelationsInclude() {
    return {
      company: true,
      currentShop: true,
      shopAccesses: {
        include: {
          shop: true,
        },
      },
    };
  }

  private async toListItem(user: UserWithRelations) {
    const rolePayload = await this.resolveUserPrimaryRolePayload(user);

    return {
      id: user.id,
      user_type: user.userType,
      first_name: user.firstName,
      last_name: user.lastName,
      phone_number: user.phoneNumber,
      role: rolePayload.role_code,
      role_code: rolePayload.role_code,
      role_name: rolePayload.role_name,
      company_id: user.companyId,
      company: user.company ? this.toCompanyItem(user.company) : null,
      current_shop: user.currentShop ? this.toShopItem(user.currentShop) : null,
      allowed_shop_ids: user.shopAccesses.map((access) => access.shopId),
      current_shop_id: user.currentShopId,
      can_switch_shops: Boolean(user.canSwitchShops),
      is_active: user.isActive,
    };
  }

  private buildUserVisibilityWhere(actor: UserWithRelations) {
    if (this.isPlatformAdmin(actor)) {
      return undefined;
    }

    if (actor.userType === 'company' && actor.companyId) {
      return {
        userType: 'company',
        companyId: actor.companyId,
      };
    }

    throw new ForbiddenException('You cannot view users');
  }

  private assertUserVisibleToActor(
    actor: UserWithRelations,
    targetUser: UserWithRelations,
  ) {
    if (this.isPlatformAdmin(actor)) {
      return;
    }

    if (
      actor.userType === 'company' &&
      actor.companyId &&
      targetUser.userType === 'company' &&
      targetUser.companyId === actor.companyId
    ) {
      return;
    }

    throw new NotFoundException('User not found');
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

  private optionalBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    return undefined;
  }

  private requireBoolean(value: unknown, field: string) {
    if (typeof value !== 'boolean') {
      throw new BadRequestException(`${field} must be a boolean`);
    }

    return value;
  }

  private normalizePhoneNumber(value: string) {
    const normalized = value.replace(/\D/g, '');

    if (!normalized) {
      throw new BadRequestException('phone_number must contain digits');
    }

    return normalized;
  }

  private buildPhoneNumberLookupVariants(value: string) {
    const trimmed = this.requireString(value, 'phone_number');
    const normalized = this.normalizePhoneNumber(trimmed);

    return Array.from(new Set([trimmed, normalized, `+${normalized}`]));
  }

  private parseUserType(value: unknown) {
    const normalized = (this.optionalString(value) ?? 'company').toLowerCase();

    if (normalized === 'platform') {
      return 'platform';
    }

    if (normalized === 'company') {
      return 'company';
    }

    throw new BadRequestException('user_type has an invalid value');
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

  private isPlatformAdmin(user: UserWithRelations) {
    return (
      user.userType === 'platform' &&
      PLATFORM_ADMIN_ROLES.has(user.role.trim().toLowerCase())
    );
  }

  private isCompanyAdmin(user: UserWithRelations) {
    return (
      user.userType === 'company' &&
      COMPANY_ADMIN_ROLES.has(user.role.trim().toLowerCase())
    );
  }

  private canManageUser(actor: UserWithRelations, targetUser: UserWithRelations) {
    if (this.isPlatformAdmin(actor)) {
      return true;
    }

    if (!this.isCompanyAdmin(actor)) {
      return false;
    }

    return (
      actor.userType === 'company' &&
      targetUser.userType === 'company' &&
      actor.companyId === targetUser.companyId
    );
  }

  private async resolveUserPrimaryRolePayload(user: UserWithRelations) {
    if (user.userType === 'platform') {
      const roleItem = this.toRoleItem(user.role);
      return {
        role: roleItem.role,
        role_code: user.role,
        role_name: roleItem.role.name,
      };
    }

    if (!user.companyId) {
      const roleItem = this.toRoleItem(user.role);
      return {
        role: roleItem.role,
        role_code: user.role,
        role_name: roleItem.role.name,
      };
    }

    const companyRole = await this.findCompanyRoleByCode(user.companyId, user.role);
    const resolvedRole =
      companyRole ?? this.toFallbackCompanyRole(user.companyId, user.role);

    return {
      role: {
        name: resolvedRole.name,
      },
      role_code: resolvedRole.code,
      role_name: resolvedRole.name,
    };
  }

  private async ensureDefaultCompanyRoles(companyId: string, tx?: any) {
    const db = tx ?? this.db;
    const companyRole = this.getCompanyRoleDelegate(db);

    if (!companyRole) {
      return;
    }

    await companyRole.createMany({
      data: DEFAULT_COMPANY_ROLES.map((role) => ({
        companyId,
        code: role.code,
        name: role.name,
        isSystem: role.isSystem,
        isActive: true,
      })),
      skipDuplicates: true,
    });
  }

  private async resolveCompanyUserRoleCode(
    companyId: string | null | undefined,
    value: unknown,
  ) {
    if (!companyId) {
      throw new BadRequestException('company_id is required for company user role');
    }

    await this.ensureDefaultCompanyRoles(companyId);
    const roleCode = this.normalizeCompanyRoleCode(value, 'role');
    const role = await this.findCompanyRoleByCode(companyId, roleCode);

    if (!role || !role.isActive) {
      throw new BadRequestException('Company role not found or inactive');
    }

    return role.code;
  }

  private normalizePlatformRole(value: unknown, field: string) {
    const role = this.requireString(value, field).trim().toLowerCase();

    if (!ROLE_DEFINITIONS[role] || !['platform_admin', 'support', 'superadmin'].includes(role)) {
      throw new BadRequestException(`${field} has an invalid platform role`);
    }

    return role;
  }

  private normalizeCompanyRoleCode(value: unknown, field: string) {
    const normalized = this.requireString(value, field).trim().toLowerCase();

    if (!/^[a-z0-9-_]+$/.test(normalized)) {
      throw new BadRequestException(
        `${field} must contain only lowercase latin letters, numbers, dash or underscore`,
      );
    }

    return normalized;
  }

  private async generateUniqueCompanyRoleCode(companyId: string, name: string) {
    this.assertCompanyRoleStorageAvailable();

    const baseCode = this.normalizeCompanyRoleCode(
      name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role',
      'code',
    );
    const existingRoles = await this.db.companyRole.findMany({
      where: {
        companyId,
        code: {
          startsWith: baseCode,
        },
      },
      select: {
        code: true,
      },
    });
    const existingCodes = new Set(
      existingRoles.map((role: { code: string }) => role.code),
    );

    if (!existingCodes.has(baseCode)) {
      return baseCode;
    }

    let suffix = 2;

    while (existingCodes.has(`${baseCode}-${suffix}`)) {
      suffix += 1;
    }

    return `${baseCode}-${suffix}`;
  }

  private async findCompanyRoleByCode(companyId: string, code: string) {
    await this.ensureDefaultCompanyRoles(companyId);

    if (!this.hasCompanyRoleStorage()) {
      return DEFAULT_COMPANY_ROLES.some((role) => role.code === code.trim().toLowerCase())
        ? this.toFallbackCompanyRole(companyId, code.trim().toLowerCase())
        : null;
    }

    return this.db.companyRole.findFirst({
      where: {
        companyId,
        code: code.trim().toLowerCase(),
      },
    });
  }

  private async findCompanyRoleByIdOrThrow(roleId: string, companyId: string) {
    this.assertCompanyRoleStorageAvailable();

    const role = await this.db.companyRole.findFirst({
      where: {
        id: roleId,
        companyId,
      },
    });

    if (!role) {
      throw new NotFoundException('Company role not found');
    }

    return role as CompanyRoleRecord;
  }

  private toCompanyRoleItem(role: CompanyRoleRecord) {
    return {
      id: role.id,
      role_id: role.id,
      company_id: role.companyId,
      code: role.code,
      name: role.name,
      is_system: role.isSystem,
      is_active: role.isActive,
      role: {
        name: role.name,
      },
      created_at: role.createdAt,
      updated_at: role.updatedAt,
    };
  }

  private toCompanyRoleOption(role: CompanyRoleRecord) {
    return {
      id: role.id,
      role_id: role.code,
      role: {
        name: role.name,
      },
    };
  }

  private toFallbackCompanyRole(companyId: string, roleCode: string): CompanyRoleRecord {
    const fallbackName = ROLE_DEFINITIONS[roleCode]?.name ?? roleCode;

    return {
      id: roleCode,
      companyId,
      code: roleCode,
      name: fallbackName,
      isSystem: false,
      isActive: true,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  private async resolveRoles(
    role: string,
    userType: 'platform' | 'company',
    companyId?: string | null,
  ) {
    const normalizedRole = role.trim().toLowerCase();

    if (userType === 'platform') {
      return [this.toRoleItem(normalizedRole)];
    }

    if (!companyId) {
      return [this.toRoleItem(normalizedRole)];
    }

    await this.ensureDefaultCompanyRoles(companyId);
    const companyRoles = this.hasCompanyRoleStorage()
      ? await this.db.companyRole.findMany({
          where: {
            companyId,
            isActive: true,
          },
          orderBy: [{ isSystem: 'desc' }, { createdAt: 'asc' }],
        })
      : DEFAULT_COMPANY_ROLES.map((role) => ({
          id: role.code,
          companyId,
          code: role.code,
          name: role.name,
          isSystem: role.isSystem,
          isActive: true,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        }));
    const companyRoleLookup = new Map<string, CompanyRoleRecord>(
      companyRoles.map((companyRole: CompanyRoleRecord) => [
        companyRole.code,
        companyRole,
      ]),
    );
    const primaryRole =
      companyRoleLookup.get(normalizedRole) ?? this.toFallbackCompanyRole(companyId, normalizedRole);

    if (COMPANY_ADMIN_ROLES.has(normalizedRole)) {
      const managementRoles = ['store_manager', 'cashier']
        .map((roleCode) => companyRoleLookup.get(roleCode))
        .filter(Boolean)
        .map((companyRole: CompanyRoleRecord) => this.toCompanyRoleOption(companyRole));

      return [
        this.toCompanyRoleOption(primaryRole),
        ...managementRoles,
      ];
    }

    return [this.toCompanyRoleOption(primaryRole)];
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

  private toCompanyItem(company: {
    id: string;
    login: string;
    name: string;
    subdomain: string;
    isActive: boolean;
  }) {
    return {
      id: company.id,
      company_id: company.id,
      login: company.login,
      subdomain: company.subdomain,
      name: company.name,
      is_active: company.isActive,
    };
  }

  private toShopItem(shop: {
    id: string;
    companyId: string;
    name: string;
    branchCode: string;
    isActive: boolean;
  }) {
    return {
      id: shop.id,
      shop_id: shop.id,
      company_id: shop.companyId,
      branch_code: shop.branchCode,
      is_active: shop.isActive,
      shop: {
        name: shop.name,
      },
    };
  }

  private async resolveCompanyIdForActor(value: unknown, actor?: UserWithRelations) {
    if (actor?.userType === 'company') {
      const companyActor = actor;

      if (!companyActor.companyId) {
        throw new ForbiddenException('Company admin is missing company');
      }

      const requestedCompanyId = this.optionalString(value);
      if (requestedCompanyId && requestedCompanyId !== companyActor.companyId) {
        throw new ForbiddenException('You cannot create users for another company');
      }

      return companyActor.companyId;
    }

    const identifier = this.requireString(value, 'company_id');
    const company = await this.db.company.findFirst({
      where: {
        OR: [{ id: identifier }, { login: identifier.toLowerCase() }],
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.isActive) {
      throw new BadRequestException('Company is inactive');
    }

    return company.id;
  }

  private async ensureCompanyExists(companyId: string) {
    const company = await this.db.company.findUnique({
      where: { id: companyId },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    return company;
  }

  private async resolveAllowedShopsForWrite(
    companyId: string,
    rawAllowedShopIds: unknown,
    fallbackShopIdentifier?: string,
  ) {
    const explicitIds = Array.isArray(rawAllowedShopIds)
      ? rawAllowedShopIds.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : [];
    const identifiers = explicitIds.length
      ? explicitIds
      : fallbackShopIdentifier
        ? [fallbackShopIdentifier]
        : [];

    if (!identifiers.length) {
      const companyShops = await this.db.shop.findMany({
        where: {
          companyId,
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      return companyShops.length === 1 ? companyShops : [];
    }

    const shops = await Promise.all(
      identifiers.map((identifier) =>
        this.findShopByIdentifierOrThrow(identifier, companyId),
      ),
    );

    return shops.filter(
      (shop, index, array) => array.findIndex((item) => item.id === shop.id) === index,
    );
  }

  private async resolveCurrentShopForWrite(
    companyId: string,
    requestedShopIdentifier: string | undefined,
    allowedShops: Array<{
      id: string;
      companyId: string;
      name: string;
      branchCode: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    if (requestedShopIdentifier) {
      const requestedShop = await this.findShopByIdentifierOrThrow(
        requestedShopIdentifier,
        companyId,
      );

      if (!allowedShops.some((shop) => shop.id === requestedShop.id)) {
        throw new BadRequestException(
          'current_shop_id must be included in allowed_shop_ids',
        );
      }

      return requestedShop;
    }

    return allowedShops[0] ?? null;
  }

  private async findShopByIdentifierOrThrow(
    shopIdentifier: string,
    companyId: string,
    options?: { allowInactive?: boolean },
  ) {
    const identifier = shopIdentifier.trim();
    const shop = await this.db.shop.findFirst({
      where: {
        companyId,
        OR: [{ id: identifier }, { branchCode: identifier }],
      },
    });

    if (!shop) {
      throw new NotFoundException('Shop not found');
    }

    if (!options?.allowInactive && !shop.isActive) {
      throw new BadRequestException('Shop is inactive');
    }

    return shop;
  }

  private async resolveAvailableShopsForUser(user: UserWithRelations) {
    if (user.userType !== 'company' || !user.companyId) {
      return [];
    }

    if (COMPANY_ADMIN_ROLES.has(user.role.trim().toLowerCase())) {
      const allCompanyShops = await this.db.shop.findMany({
        where: {
          companyId: user.companyId,
          isActive: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      if (!user.shopAccesses.length && allCompanyShops.length === 1) {
        await this.db.userShopAccess.createMany({
          data: [
            {
              userId: user.id,
              shopId: allCompanyShops[0].id,
            },
          ],
          skipDuplicates: true,
        });
      }

      return allCompanyShops;
    }

    if (user.shopAccesses.length) {
      return user.shopAccesses
        .map((access) => access.shop)
        .filter((shop) => shop && shop.isActive);
    }

    if (user.currentShop?.isActive) {
      await this.db.userShopAccess.createMany({
        data: [
          {
            userId: user.id,
            shopId: user.currentShop.id,
          },
        ],
        skipDuplicates: true,
      });

      return [user.currentShop];
    }

    const allCompanyShops = await this.db.shop.findMany({
      where: {
        companyId: user.companyId,
        isActive: true,
      },
      orderBy: {
        name: 'asc',
      },
    });

    if (allCompanyShops.length === 1) {
      await this.db.userShopAccess.createMany({
        data: [
          {
            userId: user.id,
            shopId: allCompanyShops[0].id,
          },
        ],
        skipDuplicates: true,
      });

      return allCompanyShops;
    }

    return [];
  }

  private resolveCurrentShop(
    user: UserWithRelations,
    availableShops: Array<{
      id: string;
      companyId: string;
      name: string;
      branchCode: string;
      isActive: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>,
  ) {
    if (!availableShops.length) {
      return null;
    }

    return (
      availableShops.find((shop) => shop.id === user.currentShopId) ??
      availableShops[0]
    );
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
      const user = await this.findByIdOrThrow(payload.sub);
      await this.assertUserCanAuthenticate(user);

      return user;
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

  private toProfileResponse(user: UserWithRelations) {
    return {
      id: user.id,
      user_type: user.userType,
      first_name: user.firstName,
      last_name: user.lastName,
      full_name: `${user.firstName} ${user.lastName}`.trim(),
      phone_number: user.phoneNumber,
      avatar_url: user.avatarUrl,
      language: user.language,
      theme: user.theme,
      company_id: user.companyId,
      current_shop_id: user.currentShopId,
      can_switch_shops: Boolean(user.canSwitchShops),
      allowed_shop_ids: user.shopAccesses.map((access) => access.shopId),
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

  private assertUserIsActive(user: UserWithRelations) {
    if (!user.isActive) {
      throw new UnauthorizedException('User is inactive');
    }
  }

  private assertCompanyMembershipIsActive(user: UserWithRelations) {
    if (user.userType !== 'company') {
      return;
    }

    if (!user.companyId || !user.company) {
      throw new UnauthorizedException('Company user is missing company');
    }

    if (!user.company.isActive) {
      throw new UnauthorizedException('Company is inactive');
    }
  }

  private async assertCompanyRoleIsActive(user: UserWithRelations) {
    if (user.userType !== 'company' || !user.companyId) {
      return;
    }

    const companyRole = await this.findCompanyRoleByCode(user.companyId, user.role);

    if (!companyRole || !companyRole.isActive) {
      throw new UnauthorizedException('Company role is inactive');
    }
  }
}
