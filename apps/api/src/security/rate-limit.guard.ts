import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimiter } from './rate-limiter.js';
import {
  SECURITY_POLICY_TOKEN,
  type RateLimitedSurface,
  type SecurityPolicy,
} from './security-policy.js';

const SURFACE = 'rate-limited-surface';
const BEARER_PREFIX = 'Bearer ';
const UNKNOWN_ADDRESS = 'unknown';
const SESSION_SURFACES: ReadonlySet<RateLimitedSurface> = new Set(['DASHBOARD', 'DASHBOARD_WRITE']);

type HttpRequest = IncomingMessage & { readonly ip?: string };

export function RateLimit(surface: RateLimitedSurface): CustomDecorator {
  return SetMetadata(SURFACE, surface);
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
    @Inject(SECURITY_POLICY_TOKEN) private readonly policy: SecurityPolicy,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const surface = this.reflector.getAllAndOverride<RateLimitedSurface | undefined>(SURFACE, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    if (surface === undefined) {
      return true;
    }
    const http = execution.switchToHttp();
    const decision = this.limiter.consume(
      `${surface}:${subjectOf(http.getRequest<HttpRequest>(), surface)}`,
      this.policy.rateLimits[surface],
      new Date(),
    );
    if (decision.isAllowed) {
      return true;
    }
    if (decision.isFirstRejection) {
      this.logger.warn(`event=rate-limited surface=${surface}`);
    }
    http
      .getResponse<ServerResponse>()
      .setHeader('Retry-After', String(decision.retryAfterInSeconds));
    throw new HttpException('Too Many Requests', HttpStatus.TOO_MANY_REQUESTS);
  }
}

function subjectOf(request: HttpRequest, surface: RateLimitedSurface): string {
  const header = request.headers.authorization;
  if (SESSION_SURFACES.has(surface) && header?.startsWith(BEARER_PREFIX) === true) {
    return createHash('sha256').update(header).digest('hex');
  }
  return request.ip ?? request.socket.remoteAddress ?? UNKNOWN_ADDRESS;
}
