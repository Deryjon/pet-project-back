import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user?.userType !== 'company' || !user.companyId) {
      throw new ForbiddenException(
        'Only company users can access this resource',
      );
    }

    return true;
  }
}
