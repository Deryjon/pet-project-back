import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { PERMISSIONS_KEY } from '../permissions.decorator';

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

    const activePermissions = await this.prisma.rolePermission.count({
      where: {
        roleId,
        permissionId: {
          in: requiredPermissions,
        },
        isActive: true,
      },
    });

    if (activePermissions < requiredPermissions.length) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
