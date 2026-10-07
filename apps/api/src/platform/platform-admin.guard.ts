import type { IncomingMessage } from 'node:http';
import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { RequestContext } from '../households/request-context.js';
import { PlatformAccessService } from './platform-access.service.js';

type AuthenticatedRequest = IncomingMessage & { context?: RequestContext };

@Injectable()
export class PlatformAdminGuard implements CanActivate {
  constructor(private readonly access: PlatformAccessService) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const { context } = execution.switchToHttp().getRequest<AuthenticatedRequest>();
    if (context === undefined) {
      throw new UnauthorizedException();
    }
    if (!(await this.access.isPlatformAdmin(context))) {
      throw new ForbiddenException();
    }
    return true;
  }
}
