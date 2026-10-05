import { contentSecurityPolicy, securityHeaders } from './security-headers';

function valueOf(isProduction: boolean, key: string): string | undefined {
  return securityHeaders(isProduction).find((header) => header.key === key)?.value;
}

describe('web security headers', () => {
  it('restricts every resource to the application itself in production', () => {
    const policy = contentSecurityPolicy(true);

    expect(policy).toContain("default-src 'self'");
    expect(policy).toContain("connect-src 'self';");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("base-uri 'self'");
    expect(policy).toContain("form-action 'self'");
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).not.toMatch(/https?:|\*|unsafe-eval|ws:/);
  });

  it('allows what the development server needs only outside production', () => {
    expect(contentSecurityPolicy(false)).toContain("'unsafe-eval'");
    expect(contentSecurityPolicy(false)).toContain('ws:');
  });

  it('forbids framing, sniffing and referrers', () => {
    expect(valueOf(true, 'X-Frame-Options')).toBe('DENY');
    expect(valueOf(true, 'X-Content-Type-Options')).toBe('nosniff');
    expect(valueOf(true, 'Referrer-Policy')).toBe('no-referrer');
    expect(valueOf(true, 'Permissions-Policy')).toContain('camera=()');
  });

  it('sends HSTS only in production', () => {
    expect(valueOf(true, 'Strict-Transport-Security')).toBe('max-age=31536000; includeSubDomains');
    expect(valueOf(false, 'Strict-Transport-Security')).toBeUndefined();
  });
});
