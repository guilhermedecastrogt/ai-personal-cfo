export interface ResponseHeader {
  readonly key: string;
  readonly value: string;
}

const HSTS_MAX_AGE_IN_SECONDS = 31_536_000;

export function contentSecurityPolicy(isProduction: boolean): string {
  const scripts = isProduction ? "'self' 'unsafe-inline'" : "'self' 'unsafe-inline' 'unsafe-eval'";
  return [
    "default-src 'self'",
    `script-src ${scripts}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    `connect-src 'self'${isProduction ? '' : ' ws:'}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export function securityHeaders(isProduction: boolean): ResponseHeader[] {
  return [
    { key: 'Content-Security-Policy', value: contentSecurityPolicy(isProduction) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Referrer-Policy', value: 'no-referrer' },
    {
      key: 'Permissions-Policy',
      value: 'camera=(), microphone=(), geolocation=(), payment=(), browsing-topics=()',
    },
    { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
    ...(isProduction
      ? [
          {
            key: 'Strict-Transport-Security',
            value: `max-age=${String(HSTS_MAX_AGE_IN_SECONDS)}; includeSubDomains`,
          },
        ]
      : []),
  ];
}
