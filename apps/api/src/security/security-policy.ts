export interface RateLimitRule {
  readonly limit: number;
  readonly windowInSeconds: number;
}

export const RATE_LIMITED_SURFACES = [
  'AUTHENTICATION',
  'DASHBOARD',
  'DASHBOARD_WRITE',
  'WEBHOOK',
] as const;

export type RateLimitedSurface = (typeof RATE_LIMITED_SURFACES)[number];

export interface SecurityPolicy {
  readonly requestBodyLimitInBytes: number;
  readonly rateLimits: Readonly<Record<RateLimitedSurface, RateLimitRule>>;
  readonly inboundMessages: {
    readonly text: RateLimitRule;
    readonly image: RateLimitRule;
  };
  readonly rateLimiterMaximumKeys: number;
  readonly sessions: {
    readonly lifetimeInDays: number;
    readonly maximumPerMember: number;
  };
  readonly strictTransportSecurityInSeconds: number;
  readonly minimumWebhookSecretLength: number;
}

export const SECURITY_POLICY_TOKEN = Symbol('SECURITY_POLICY');

export const SECURITY_POLICY: SecurityPolicy = {
  requestBodyLimitInBytes: 262_144,
  rateLimits: {
    AUTHENTICATION: { limit: 10, windowInSeconds: 60 },
    DASHBOARD: { limit: 240, windowInSeconds: 60 },
    DASHBOARD_WRITE: { limit: 30, windowInSeconds: 60 },
    WEBHOOK: { limit: 600, windowInSeconds: 60 },
  },
  inboundMessages: {
    text: { limit: 30, windowInSeconds: 60 },
    image: { limit: 6, windowInSeconds: 60 },
  },
  rateLimiterMaximumKeys: 50_000,
  sessions: {
    lifetimeInDays: 7,
    maximumPerMember: 10,
  },
  strictTransportSecurityInSeconds: 31_536_000,
  minimumWebhookSecretLength: 16,
};
