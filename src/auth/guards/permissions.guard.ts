import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { ANY_PERMISSIONS_KEY, PERMISSIONS_KEY } from '../permissions.decorator';
import { loadRoleAccess, roleAccessAllows } from '../role-permissions';

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

    const anyPermissions =
      this.reflector.getAllAndOverride<string[]>(ANY_PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? [];

    if (!requiredPermissions.length && !anyPermissions.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const roleId = user?.crmRoleId;

    if (!roleId) {
      throw new ForbiddenException('Missing role permissions');
    }

    const access = await loadRoleAccess(this.prisma, roleId, user.companyId);

    if (!access) throw new ForbiddenException('Role is not available');

    const allowed =
      roleAccessAllows(access, requiredPermissions) &&
      (!anyPermissions.length ||
        anyPermissions.some((permission) =>
          roleAccessAllows(access, [permission]),
        ));
    if (!allowed) {
      throw new ForbiddenException('Insufficient permissions');
    }

    return true;
  }
}
