import { Global, Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard.js';
import { RateLimiter } from './rate-limiter.js';
import { SafeExceptionFilter } from './safe-exception.filter.js';
import { SECURITY_POLICY, SECURITY_POLICY_TOKEN } from './security-policy.js';

@Global()
@Module({
  providers: [
    { provide: SECURITY_POLICY_TOKEN, useValue: SECURITY_POLICY },
    { provide: APP_FILTER, useClass: SafeExceptionFilter },
    RateLimiter,
    RateLimitGuard,
  ],
  exports: [SECURITY_POLICY_TOKEN, RateLimiter, RateLimitGuard],
})
export class SecurityModule {}
