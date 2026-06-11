import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getPermissionIdsBySlug } from '../../roles/roles.permissions';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../permissions.decorator';

const LEGACY_PERMISSION_ALIASES: Record<string, string[]> = {
  'orders.read': ['orders'],
  'orders.create': ['orders'],
  'orders.cancel': ['orders'],
  'orders.complete': ['orders'],
  'payments.create': ['payment-types'],
  'cashboxes.manage': ['cashbox-list', 'cashbox-create'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredPermissions =
      this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!requiredPermissions.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roleId = user?.crmRoleId;

    if (!roleId) {
      throw new ForbiddenException('Missing role permissions');
    }

    const role = await this.prisma.role.findFirst({
      where: {
        id: roleId,
        companyId: user.companyId,
      },
      select: {
        isAdmin: true,
      },
    });

    if (role?.isAdmin) {
      return true;
    }

    const resolvedPermissions = requiredPermissions.map((permission) => ({
      key: permission,
      permissionIds: this.resolvePermissionIds(permission),
    }));

    const activePermissions = await this.prisma.rolePermission.findMany({
      where: {
        roleId,
        isActive: true,
      },
      select: {
        permissionId: true,
      },
    });
    const activePermissionIds = new Set(
      activePermissions.map((item) => item.permissionId),
    );

    const hasAllPermissions = resolvedPermissions.every((permission) =>
      permission.permissionIds.some((permissionId) =>
        activePermissionIds.has(permissionId),
      ),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }

  private resolvePermissionIds(permission: string) {
    const normalizedPermission = permission.trim().toLowerCase();
    const aliasPermissions =
      LEGACY_PERMISSION_ALIASES[normalizedPermission] ?? [normalizedPermission];
    const resolvedPermissionIds = aliasPermissions.flatMap((item) =>
      getPermissionIdsBySlug(item),
    );

    if (resolvedPermissionIds.length > 0) {
      return [...new Set(resolvedPermissionIds)];
    }

    return [permission.trim()];
  }
}
