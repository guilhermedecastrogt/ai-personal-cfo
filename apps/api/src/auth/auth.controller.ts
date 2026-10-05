import type { IncomingMessage } from 'node:http';
import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UnprocessableEntityException,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { RateLimit, RateLimitGuard } from '../security/rate-limit.guard.js';
import { AuthService, type IssuedSession } from './auth.service.js';
import { MAXIMUM_PASSWORD_LENGTH } from './passwords.js';
import { bearerTokenOf } from './session.guard.js';

const MAXIMUM_ACCESS_CODE_LENGTH = 200;
const MAXIMUM_EMAIL_LENGTH = 254;
const ACCESS_CODE = /^[A-Za-z0-9_-]+$/;

const accessCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAXIMUM_ACCESS_CODE_LENGTH)
  .regex(ACCESS_CODE);
const emailSchema = z.string().trim().pipe(z.email().max(MAXIMUM_EMAIL_LENGTH));
const passwordSchema = z.string().min(1).max(MAXIMUM_PASSWORD_LENGTH);

const signInSchema = z.union([
  z.object({ accessCode: accessCodeSchema }),
  z.object({ email: emailSchema, password: passwordSchema }),
]);

const setUpSchema = z.object({
  accessCode: accessCodeSchema,
  email: emailSchema,
  password: passwordSchema,
});

export interface SessionResponse {
  readonly token: string;
  readonly expiresAt: string;
  readonly member: string;
}

function responseOf(session: IssuedSession): SessionResponse {
  return {
    token: session.token,
    expiresAt: session.expiresAt.toISOString(),
    member: session.memberName,
  };
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('sessions')
  @UseGuards(RateLimitGuard)
  @RateLimit('AUTHENTICATION')
  @HttpCode(HttpStatus.CREATED)
  async signIn(@Body() body: unknown): Promise<SessionResponse> {
    const parsed = signInSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException();
    }
    const session =
      'accessCode' in parsed.data
        ? await this.auth.signIn(parsed.data.accessCode, new Date())
        : await this.auth.signInWithPassword(parsed.data.email, parsed.data.password, new Date());
    if (session === undefined) {
      throw new UnauthorizedException();
    }
    return responseOf(session);
  }

  @Post('credentials')
  @UseGuards(RateLimitGuard)
  @RateLimit('AUTHENTICATION')
  @HttpCode(HttpStatus.CREATED)
  async setUpAccess(@Body() body: unknown): Promise<SessionResponse> {
    const parsed = setUpSchema.safeParse(body);
    if (!parsed.success) {
      throw new UnauthorizedException();
    }
    const { accessCode, email, password } = parsed.data;
    const setup = await this.auth.setUpAccess(accessCode, email, password, new Date());
    if (setup.status === 'WEAK_PASSWORD') {
      throw new UnprocessableEntityException({ code: 'WEAK_PASSWORD' });
    }
    if (setup.status === 'REFUSED') {
      throw new UnauthorizedException();
    }
    return responseOf(setup.session);
  }

  @Delete('sessions/current')
  @UseGuards(RateLimitGuard)
  @RateLimit('DASHBOARD')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() request: IncomingMessage): Promise<void> {
    const token = bearerTokenOf(request);
    if (token !== undefined) {
      await this.auth.signOut(token);
    }
  }
}
