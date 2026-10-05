import type { IncomingMessage } from 'node:http';
import {
  createParamDecorator,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { RequestContext } from '../households/request-context.js';
import { AuthService } from './auth.service.js';

const BEARER_PREFIX = 'Bearer ';

type AuthenticatedRequest = IncomingMessage & { context?: RequestContext };

export function bearerTokenOf(request: IncomingMessage): string | undefined {
  const header = request.headers.authorization;
  const token =
    header?.startsWith(BEARER_PREFIX) === true ? header.slice(BEARER_PREFIX.length).trim() : '';
  return token === '' ? undefined : token;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const request = execution.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = bearerTokenOf(request);
    const context = token === undefined ? undefined : await this.auth.resolve(token, new Date());
    if (context === undefined) {
      throw new UnauthorizedException();
    }
    request.context = context;
    return true;
  }
}

export const CurrentContext = createParamDecorator(
  (_data: unknown, execution: ExecutionContext): RequestContext => {
    const { context } = execution.switchToHttp().getRequest<AuthenticatedRequest>();
    if (context === undefined) {
      throw new UnauthorizedException();
    }
    return context;
  },
);
