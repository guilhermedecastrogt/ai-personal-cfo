import { RateLimiter } from './rate-limiter.js';
import { SECURITY_POLICY } from './security-policy.js';

const RULE = { limit: 3, windowInSeconds: 60 };
const START = new Date('2026-10-20T12:00:00Z');

function secondsLater(seconds: number): Date {
  return new Date(START.getTime() + seconds * 1000);
}

describe('RateLimiter', () => {
  it('allows requests up to the limit and refuses the next', () => {
    const limiter = new RateLimiter(SECURITY_POLICY);

    const decisions = [0, 1, 2, 3, 4].map((second) =>
      limiter.consume('key', RULE, secondsLater(second)),
    );

    expect(decisions.map((decision) => decision.isAllowed)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(decisions.map((decision) => decision.isFirstRejection)).toEqual([
      false,
      false,
      false,
      true,
      false,
    ]);
  });

  it('says how long until the window ends', () => {
    const limiter = new RateLimiter(SECURITY_POLICY);
    limiter.consume('key', RULE, START);

    expect(limiter.consume('key', RULE, secondsLater(20)).retryAfterInSeconds).toBe(40);
    expect(limiter.consume('key', RULE, secondsLater(59.5)).retryAfterInSeconds).toBe(1);
  });

  it('starts a new window once the previous one has passed', () => {
    const limiter = new RateLimiter(SECURITY_POLICY);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.consume('key', RULE, START);
    }

    expect(limiter.consume('key', RULE, secondsLater(59)).isAllowed).toBe(false);
    expect(limiter.consume('key', RULE, secondsLater(60)).isAllowed).toBe(true);
  });

  it('counts each key on its own', () => {
    const limiter = new RateLimiter(SECURITY_POLICY);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      limiter.consume('first', RULE, START);
    }

    expect(limiter.consume('second', RULE, START).isAllowed).toBe(true);
  });

  it('never tracks more keys than the policy allows', () => {
    const limiter = new RateLimiter({ ...SECURITY_POLICY, rateLimiterMaximumKeys: 100 });

    for (let position = 0; position < 10_000; position += 1) {
      limiter.consume(`key-${String(position)}`, RULE, secondsLater(position / 1000));
    }

    expect(limiter.trackedKeys).toBeLessThanOrEqual(100);
  });

  it('keeps counting a key that is still being used while others are evicted', () => {
    const limiter = new RateLimiter({ ...SECURITY_POLICY, rateLimiterMaximumKeys: 10 });

    for (let position = 0; position < 200; position += 1) {
      limiter.consume('attacker', { limit: 5, windowInSeconds: 60 }, START);
      limiter.consume(`other-${String(position)}`, RULE, START);
    }

    expect(limiter.consume('attacker', { limit: 5, windowInSeconds: 60 }, START).isAllowed).toBe(
      false,
    );
  });
});
