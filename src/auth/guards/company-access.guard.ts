import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { requireCompanyContext } from '../request-context';

@Injectable()
export class CompanyAccessGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.companyContext = requireCompanyContext(request.user);

    return true;
  }
}
