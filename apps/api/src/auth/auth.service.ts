import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { RequestContext } from '../households/request-context.js';
import { AuthRepository } from './auth.repository.js';

const SECRET_BYTES = 32;
const SESSION_LIFETIME_IN_DAYS = 7;
const MILLISECONDS_PER_DAY = 86_400_000;

export interface IssuedSession {
  readonly token: string;
  readonly expiresAt: Date;
  readonly memberName: string;
}

function hashOf(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function newSecret(): string {
  return randomBytes(SECRET_BYTES).toString('base64url');
}

@Injectable()
export class AuthService {
  constructor(private readonly repository: AuthRepository) {}

  async issueAccessCode(householdId: string, memberId: string): Promise<string> {
    const code = newSecret();
    await this.repository.saveAccessCode(householdId, memberId, hashOf(code));
    return code;
  }

  async signIn(accessCode: string, instant: Date): Promise<IssuedSession | undefined> {
    const owner = await this.repository.findOwnerOfAccessCode(hashOf(accessCode));
    if (owner === undefined) {
      return undefined;
    }
    const token = newSecret();
    const expiresAt = new Date(instant.getTime() + SESSION_LIFETIME_IN_DAYS * MILLISECONDS_PER_DAY);
    await this.repository.deleteExpiredSessions(instant);
    await this.repository.createSession(owner, hashOf(token), expiresAt);
    return { token, expiresAt, memberName: owner.memberName };
  }

  async resolve(token: string, instant: Date): Promise<RequestContext | undefined> {
    const owner = await this.repository.findOwnerOfSession(hashOf(token), instant);
    return owner === undefined ? undefined : { ...owner, channel: 'web' };
  }

  async signOut(token: string): Promise<void> {
    await this.repository.deleteSession(hashOf(token));
  }
}
