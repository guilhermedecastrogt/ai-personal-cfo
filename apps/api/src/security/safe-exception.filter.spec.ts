import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  type ArgumentsHost,
} from '@nestjs/common';
import { hardenHttp, securityHeaders } from './http-hardening.js';
import { describeError, SafeExceptionFilter } from './safe-exception.filter.js';
import { SECURITY_POLICY } from './security-policy.js';

interface Captured {
  status?: number;
  body?: unknown;
}

function handle(error: unknown): Captured {
  const captured: Captured = {};
  const response = {
    getHeader: (): string => 'request-1',
    status: (code: number) => {
      captured.status = code;
      return {
        json: (body: unknown): void => {
          captured.body = body;
        },
      };
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ method: 'GET' }),
    }),
  } as unknown as ArgumentsHost;
  new SafeExceptionFilter().catch(error, host);
  return captured;
}

describe('SafeExceptionFilter', () => {
  const logged: string[] = [];

  beforeEach(() => {
    logged.length = 0;
    Logger.overrideLogger({
      log: () => undefined,
      warn: () => undefined,
      error: (message: unknown) => {
        logged.push(String(message));
      },
    });
  });

  afterAll(() => {
    Logger.overrideLogger(false);
  });

  it('answers an unexpected error generically and logs its kind, never its message', () => {
    const cause = new Error('duplicate key value violates unique constraint (token_hash)=(abc123)');
    cause.name = 'DatabaseError';
    const error = new Error(
      'Failed query: insert into "transactions" params: 4599,Lidl,+353851112222,sk-live-secret',
      { cause },
    );
    error.name = 'DrizzleQueryError';

    const captured = handle(error);

    expect(captured).toEqual({
      status: 500,
      body: { statusCode: 500, message: 'Internal server error' },
    });
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain('event=unhandled-error request=request-1 method=GET');
    expect(logged[0]).toContain('error=DrizzleQueryError(DatabaseError)');
    expect(logged[0]).not.toMatch(/4599|Lidl|353851112222|sk-live|token_hash|abc123|insert into/);
  });

  it.each([
    [new BadRequestException('Unexpected token \'s\', "secret-body" is not valid JSON'), 400],
    [Object.assign(new Error('request entity too large'), { status: 413 }), 413],
    [Object.assign(new Error('unsupported charset "x"'), { statusCode: 415 }), 415],
  ])('replaces the detail of a rejected request with a fixed message', (error, status) => {
    const captured = handle(error);

    expect(captured.status).toBe(status);
    expect(JSON.stringify(captured.body)).not.toMatch(/secret-body|entity|charset/);
    expect(logged).toEqual([]);
  });

  it('passes on the responses the application chose to give', () => {
    expect(handle(new NotFoundException())).toEqual({
      status: 404,
      body: { message: 'Not Found', statusCode: 404 },
    });
    expect(handle(new ServiceUnavailableException({ status: 'unavailable' }))).toEqual({
      status: 503,
      body: { status: 'unavailable' },
    });
  });

  it('handles a thrown value that is not an error', () => {
    expect(handle('a string with a secret').status).toBe(500);
    expect(logged[0]).toContain('error=non-error');
    expect(describeError({ message: 'secret' })).toBe('non-error');
  });
});

describe('API security headers', () => {
  it('sends HSTS only in production', () => {
    expect(securityHeaders({ environment: 'production' }, SECURITY_POLICY)).toMatchObject({
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
      'X-Frame-Options': 'DENY',
    });
    expect(securityHeaders({ environment: 'development' }, SECURITY_POLICY)).not.toHaveProperty(
      'Strict-Transport-Security',
    );
  });

  it('configures the proxy trust, body limits and banner removal on the application', () => {
    const settings: unknown[][] = [];
    const application = {
      set: (...values: unknown[]) => settings.push(['set', ...values]),
      disable: (...values: unknown[]) => settings.push(['disable', ...values]),
      useBodyParser: (...values: unknown[]) => settings.push(['parser', ...values]),
      use: () => settings.push(['use']),
    };

    hardenHttp(application as never, { environment: 'production', trustedProxyHops: 1 });

    expect(settings).toEqual([
      ['set', 'trust proxy', 1],
      ['disable', 'x-powered-by'],
      ['parser', 'json', { limit: SECURITY_POLICY.requestBodyLimitInBytes }],
      ['parser', 'urlencoded', { limit: SECURITY_POLICY.requestBodyLimitInBytes }],
      ['use'],
    ]);
  });
});
