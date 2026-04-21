import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import {
  ROLE_PERMISSION_SECTIONS,
  ROLE_PERMISSIONS_PAYLOAD,
} from './roles.permissions';

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  private get db(): any {
    return this.prisma as any;
  }

  async create(body: Record<string, unknown>, authorization?: string) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      body.company_id,
    );
    const name = this.requireString(body.name, 'name');
    const description = this.optionalString(body.description) ?? '';
    const isAdmin = this.optionalBoolean(body.is_admin) ?? false;

    await this.ensureRoleNameIsUnique(companyId, name);
    const externalId = await this.getNextExternalId();

    const role = await this.db.role.create({
      data: {
        companyId,
        name,
        description,
        isAdmin,
        externalId,
      },
    });

    return {
      message: role.id,
    };
  }

  async findAll(authorization?: string, companyIdInput?: string) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      companyIdInput,
    );
    const roles = await this.db.role.findMany({
      where: {
        companyId,
        deletedAt: 0,
      },
      orderBy: [{ isAdmin: 'desc' }, { name: 'asc' }],
    });

    return {
      count: roles.length,
      roles: roles.map((role) => this.toRoleResponse(role)),
    };
  }

  async findOne(id: string, authorization?: string, companyIdInput?: string) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      companyIdInput,
    );
    const role = await this.findRoleForCompany(id, companyId);
    return this.toRoleResponse(role);
  }

  async update(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
    companyIdInput?: string,
  ) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      body.company_id ?? companyIdInput,
    );
    const role = await this.findRoleForCompany(id, companyId);
    const data: Record<string, unknown> = {};

    if (body.name !== undefined) {
      const name = this.requireString(body.name, 'name');
      if (name !== role.name) {
        await this.ensureRoleNameIsUnique(companyId, name, role.id);
        data.name = name;
      }
    }

    if (body.description !== undefined) {
      data.description = this.optionalString(body.description) ?? '';
    }

    if (body.is_admin !== undefined) {
      data.isAdmin = this.optionalBoolean(body.is_admin) ?? false;
    }

    await this.db.role.update({
      where: { id: role.id },
      data,
    });

    return this.findOne(id, authorization, companyId);
  }

  async remove(id: string, authorization?: string, companyIdInput?: string) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      companyIdInput,
    );
    const role = await this.findRoleForCompany(id, companyId);

    await this.db.$transaction(async (tx: any) => {
      await tx.user.updateMany({
        where: {
          crmRoleId: role.id,
        },
        data: {
          crmRoleId: null,
          role: 'employee',
        },
      });

      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      });

      await tx.role.update({
        where: { id: role.id },
        data: {
          deletedAt: Date.now(),
        },
      });
    });

    return {
      success: true,
      id: role.id,
    };
  }

  async getPermissions(
    id: string,
    authorization?: string,
    companyIdInput?: string,
  ) {
    const access = await this.resolveReadableCompanyRolePermissions(
      authorization,
      companyIdInput,
    );

    if (!access.canReadAnyCompanyRole && access.actorRoleId !== id) {
      throw new ForbiddenException('You cannot view this role permissions');
    }

    const role = await this.findRoleForCompany(id, access.companyId);
    const activePermissionIds = await this.getActivePermissionMap(role.id);

    return {
      sections: this.buildPermissionTree(activePermissionIds),
      user_id: '',
    };
  }

  async updatePermissions(
    id: string,
    body: Record<string, unknown>,
    authorization?: string,
    companyIdInput?: string,
  ) {
    const companyId = await this.resolveManagedCompanyId(
      authorization,
      body.company_id ?? companyIdInput,
    );
    const role = await this.findRoleForCompany(id, companyId);
    const permissionIds = this.extractActivePermissionIds(body);
    const knownPermissionIds = new Set(this.getAllPermissionIds());

    for (const permissionId of permissionIds) {
      if (!knownPermissionIds.has(permissionId)) {
        throw new BadRequestException(`Unknown permission id: ${permissionId}`);
      }
    }

    await this.db.$transaction(async (tx: any) => {
      await tx.rolePermission.deleteMany({
        where: {
          roleId: role.id,
        },
      });

      if (permissionIds.length) {
        await tx.rolePermission.createMany({
          data: permissionIds.map((permissionId) => ({
            roleId: role.id,
            permissionId,
            isActive: true,
          })),
          skipDuplicates: true,
        });
      }
    });

    return this.getPermissions(id, authorization, companyId);
  }

  private async resolveManagedCompanyId(
    authorization?: string,
    companyIdInput?: unknown,
  ) {
    const actor = await this.usersService.assertAdminAccess(authorization);

    if (actor.userType === 'company') {
      if (!actor.companyId) {
        throw new BadRequestException('Company admin is missing company');
      }

      const requestedCompanyId = this.optionalString(companyIdInput);
      if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
        throw new BadRequestException('Company admin cannot manage another company');
      }

      return actor.companyId;
    }

    const companyId = this.optionalString(companyIdInput);
    if (!companyId) {
      throw new BadRequestException('company_id is required for platform role management');
    }

    const company = await this.db.company.findFirst({
      where: {
        OR: [{ id: companyId }, { login: companyId.toLowerCase() }],
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

  private async resolveReadableCompanyRolePermissions(
    authorization?: string,
    companyIdInput?: unknown,
  ) {
    const access =
      await this.usersService.assertRolePermissionsReadAccess(authorization);
    const actor = access.user;

    if (actor.userType === 'company') {
      if (!actor.companyId) {
        throw new BadRequestException('Company user is missing company');
      }

      const requestedCompanyId = this.optionalString(companyIdInput);
      if (requestedCompanyId && requestedCompanyId !== actor.companyId) {
        throw new BadRequestException('Company user cannot view another company');
      }

      return {
        companyId: actor.companyId,
        actorRoleId: actor.crmRoleId ?? null,
        canReadAnyCompanyRole: access.canReadAnyCompanyRole,
      };
    }

    const companyId = this.optionalString(companyIdInput);
    if (!companyId) {
      throw new BadRequestException(
        'company_id is required for platform role permissions',
      );
    }

    const company = await this.db.company.findFirst({
      where: {
        OR: [{ id: companyId }, { login: companyId.toLowerCase() }],
      },
    });

    if (!company) {
      throw new NotFoundException('Company not found');
    }

    if (!company.isActive) {
      throw new BadRequestException('Company is inactive');
    }

    return {
      companyId: company.id,
      actorRoleId: actor.crmRoleId ?? null,
      canReadAnyCompanyRole: true,
    };
  }

  private async findRoleForCompany(id: string, companyId: string) {
    const role = await this.db.role.findFirst({
      where: {
        id,
        companyId,
        deletedAt: 0,
      },
    });

    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return role;
  }

  private async ensureRoleNameIsUnique(
    companyId: string,
    name: string,
    excludeRoleId?: string,
  ) {
    const existing = await this.db.role.findFirst({
      where: {
        companyId,
        name,
        deletedAt: 0,
        ...(excludeRoleId
          ? {
              id: {
                not: excludeRoleId,
              },
            }
          : {}),
      },
    });

    if (existing) {
      throw new BadRequestException('Role with this name already exists');
    }
  }

  private async getNextExternalId() {
    const lastRole = await this.db.role.findFirst({
      orderBy: {
        externalId: 'desc',
      },
      select: {
        externalId: true,
      },
    });

    return Math.max(612753, (lastRole?.externalId ?? 612752) + 1);
  }

  private async getActivePermissionMap(roleId: string) {
    const rolePermissions = await this.db.rolePermission.findMany({
      where: {
        roleId,
      },
      select: {
        permissionId: true,
        isActive: true,
      },
    });

    return new Map<string, boolean>(
      rolePermissions.map((item) => [item.permissionId, Boolean(item.isActive)]),
    );
  }

  private buildPermissionTree(activePermissionIds: Map<string, boolean>) {
    return ROLE_PERMISSION_SECTIONS.map((section) => ({
      ...section,
      permissions: section.permissions.map((permission) => ({
        ...permission,
        is_active: activePermissionIds.get(permission.id) ?? false,
        children: permission.children.map((child) => ({
          ...child,
          is_active: activePermissionIds.get(child.id) ?? false,
        })),
      })),
    }));
  }

  private extractActivePermissionIds(body: Record<string, unknown>) {
    const fromPermissionIds = Array.isArray(body.permission_ids)
      ? body.permission_ids.filter(
          (value): value is string =>
            typeof value === 'string' && value.trim().length > 0,
        )
      : [];

    if (fromPermissionIds.length) {
      return [...new Set(fromPermissionIds.map((item) => item.trim()))];
    }

    const sections = Array.isArray(body.sections) ? body.sections : [];
    const activeIds = new Set<string>();

    for (const section of sections) {
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        continue;
      }

      const permissions = Array.isArray((section as Record<string, unknown>).permissions)
        ? ((section as Record<string, unknown>).permissions as unknown[])
        : [];

      for (const permission of permissions) {
        this.collectActivePermissionIds(permission, activeIds);
      }
    }

    return [...activeIds];
  }

  private collectActivePermissionIds(value: unknown, activeIds: Set<string>) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    const permission = value as Record<string, unknown>;
    const id = this.optionalString(permission.id);
    const isActive = this.optionalBoolean(permission.is_active) ?? false;

    if (id && isActive) {
      activeIds.add(id);
    }

    const children = Array.isArray(permission.children)
      ? permission.children
      : [];

    for (const child of children) {
      this.collectActivePermissionIds(child, activeIds);
    }
  }

  private getAllPermissionIds() {
    return ROLE_PERMISSIONS_PAYLOAD.sections.flatMap((section) =>
      section.permissions.flatMap((permission) => [
        permission.id,
        ...permission.children.map((child) => child.id),
      ]),
    );
  }

  private toRoleResponse(role: {
    id: string;
    clientTypeId: string;
    name: string;
    externalId: number;
    companyId: string;
    description: string;
    sessionId: string;
    isAdmin: boolean;
    type: number;
    deletedAt: number;
  }) {
    return {
      client_type_id: role.clientTypeId,
      name: role.name,
      id: role.id,
      external_id: role.externalId,
      company_id: role.companyId,
      description: role.description,
      created_at: '',
      updated_at: '',
      deleted_at: role.deletedAt,
      session_id: role.sessionId,
      is_admin: role.isAdmin,
      type: role.type,
    };
  }

  private requireString(value: unknown, field: string) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new BadRequestException(`${field} must be a non-empty string`);
    }

    return value.trim();
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
}
