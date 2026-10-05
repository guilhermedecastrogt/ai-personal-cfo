import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import type { AppConfig } from '../config/app-config.js';
import { SECURITY_POLICY, type SecurityPolicy } from './security-policy.js';

export const REQUEST_ID_HEADER = 'X-Request-Id';

const API_CONTENT_SECURITY_POLICY = "default-src 'none'; frame-ancestors 'none'";
const UNLOGGED_ROUTES: ReadonlySet<string> = new Set(['/health', '/ready']);
const ROUTE_SEGMENT = /^[a-z][a-z-]*$/;
const LOGGED_ROUTE_SEGMENTS = 2;
const API_PERMISSIONS_POLICY = 'camera=(), microphone=(), geolocation=(), payment=()';

interface HardenableApplication extends INestApplication {
  set(setting: string, value: unknown): unknown;
  disable(setting: string): unknown;
  useBodyParser(parser: 'json' | 'urlencoded', options: { limit: number }): unknown;
}

type HardeningConfig = Pick<AppConfig, 'environment' | 'trustedProxyHops'>;

export function securityHeaders(
  config: Pick<AppConfig, 'environment'>,
  policy: SecurityPolicy,
): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': API_CONTENT_SECURITY_POLICY,
    'Permissions-Policy': API_PERMISSIONS_POLICY,
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    ...(config.environment === 'production'
      ? {
          'Strict-Transport-Security': `max-age=${String(policy.strictTransportSecurityInSeconds)}; includeSubDomains`,
        }
      : {}),
  };
}

export function routeLabel(url: string | undefined): string {
  const [pathname = ''] = (url ?? '').split('?');
  const segments: string[] = [];
  for (const segment of pathname.split('/').filter((part) => part !== '')) {
    if (segments.length === LOGGED_ROUTE_SEGMENTS || !ROUTE_SEGMENT.test(segment)) {
      break;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

export function hardenHttp(
  application: INestApplication,
  config: HardeningConfig,
  policy: SecurityPolicy = SECURITY_POLICY,
): void {
  const app = application as HardenableApplication;
  const headers = Object.entries(securityHeaders(config, policy));
  app.set('trust proxy', config.trustedProxyHops);
  app.disable('x-powered-by');
  app.useBodyParser('json', { limit: policy.requestBodyLimitInBytes });
  app.useBodyParser('urlencoded', { limit: policy.requestBodyLimitInBytes });
  const logger = new Logger('Http');
  app.use((request: IncomingMessage, response: ServerResponse, next: () => void): void => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const route = routeLabel(request.url);
    response.setHeader(REQUEST_ID_HEADER, requestId);
    for (const [name, value] of headers) {
      response.setHeader(name, value);
    }
    if (!UNLOGGED_ROUTES.has(route)) {
      response.on('finish', () => {
        logger.log(
          `event=request request=${requestId} method=${request.method ?? 'unknown'} route=${route} status=${String(response.statusCode)} duration_ms=${String(Date.now() - startedAt)}`,
        );
      });
    }
    next();
  });
}
