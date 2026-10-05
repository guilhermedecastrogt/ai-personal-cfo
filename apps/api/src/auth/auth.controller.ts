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
} from '@nestjs/common';
import { z } from 'zod';
import { AuthService } from './auth.service.js';
import { bearerTokenOf } from './session.guard.js';

const MAXIMUM_ACCESS_CODE_LENGTH = 200;

const signInSchema = z.object({
  accessCode: z.string().trim().min(1).max(MAXIMUM_ACCESS_CODE_LENGTH),
});

export interface SessionResponse {
  readonly token: string;
  readonly expiresAt: string;
  readonly member: string;
}

@Controller('auth/sessions')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async signIn(@Body() body: unknown): Promise<SessionResponse> {
    const parsed = signInSchema.safeParse(body);
    const session = parsed.success
      ? await this.auth.signIn(parsed.data.accessCode, new Date())
      : undefined;
    if (session === undefined) {
      throw new UnauthorizedException();
    }
    return {
      token: session.token,
      expiresAt: session.expiresAt.toISOString(),
      member: session.memberName,
    };
  }

  @Delete('current')
  @HttpCode(HttpStatus.NO_CONTENT)
  async signOut(@Req() request: IncomingMessage): Promise<void> {
    const token = bearerTokenOf(request);
    if (token !== undefined) {
      await this.auth.signOut(token);
    }
  }
}
