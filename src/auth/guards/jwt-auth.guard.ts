import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const authorization = request.headers?.authorization;

    if (!authorization) {
      throw new UnauthorizedException('Missing bearer token');
    }

    request.user = await this.usersService.getRequestContext(authorization);
    return true;
  }
}
