import { Inject, Injectable } from '@nestjs/common';
import {
  SECURITY_POLICY_TOKEN,
  type RateLimitRule,
  type SecurityPolicy,
} from './security-policy.js';

export interface RateLimitDecision {
  readonly isAllowed: boolean;
  readonly isFirstRejection: boolean;
  readonly retryAfterInSeconds: number;
}

interface Window {
  startedAt: number;
  count: number;
}

const MILLISECONDS_PER_SECOND = 1000;

@Injectable()
export class RateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(@Inject(SECURITY_POLICY_TOKEN) private readonly policy: SecurityPolicy) {}

  consume(key: string, rule: RateLimitRule, instant: Date): RateLimitDecision {
    const now = instant.getTime();
    const length = rule.windowInSeconds * MILLISECONDS_PER_SECOND;
    const existing = this.windows.get(key);
    const window =
      existing === undefined || now - existing.startedAt >= length
        ? { startedAt: now, count: 0 }
        : existing;
    window.count += 1;
    this.windows.delete(key);
    this.windows.set(key, window);
    this.evict(now, length);
    return {
      isAllowed: window.count <= rule.limit,
      isFirstRejection: window.count === rule.limit + 1,
      retryAfterInSeconds: Math.max(
        1,
        Math.ceil((window.startedAt + length - now) / MILLISECONDS_PER_SECOND),
      ),
    };
  }

  get trackedKeys(): number {
    return this.windows.size;
  }

  private evict(now: number, length: number): void {
    if (this.windows.size <= this.policy.rateLimiterMaximumKeys) {
      return;
    }
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= length) {
        this.windows.delete(key);
      }
    }
    for (const key of this.windows.keys()) {
      if (this.windows.size <= this.policy.rateLimiterMaximumKeys) {
        return;
      }
      this.windows.delete(key);
    }
  }
}
