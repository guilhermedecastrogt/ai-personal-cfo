import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { localeOr } from '../i18n/locale.js';
import type { RequestContext } from '../households/request-context.js';
import {
  SECURITY_POLICY,
  SECURITY_POLICY_TOKEN,
  type SecurityPolicy,
} from '../security/security-policy.js';
import { AuthRepository, type SessionOwner } from './auth.repository.js';
import {
  hashPassword,
  MAXIMUM_PASSWORD_LENGTH,
  MINIMUM_PASSWORD_LENGTH,
  spendTimeLikeAVerification,
  verifyPassword,
} from './passwords.js';

const SECRET_BYTES = 32;
const MILLISECONDS_PER_DAY = 86_400_000;

export type AccessSetup =
  | { readonly status: 'SIGNED_IN'; readonly session: IssuedSession }
  | { readonly status: 'REFUSED' }
  | { readonly status: 'WEAK_PASSWORD' };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

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
  constructor(
    private readonly repository: AuthRepository,
    @Inject(SECURITY_POLICY_TOKEN) private readonly policy: SecurityPolicy = SECURITY_POLICY,
  ) {}

  async issueAccessCode(householdId: string, memberId: string): Promise<string> {
    const code = newSecret();
    await this.repository.replaceAccessCode(householdId, memberId, hashOf(code));
    return code;
  }

  async revokeAccess(householdId: string, memberId: string): Promise<void> {
    await this.repository.revokeAccess(householdId, memberId);
  }

  async registerEmail(householdId: string, memberId: string, email: string): Promise<void> {
    await this.repository.registerEmail(householdId, memberId, normalizeEmail(email));
  }

  async signIn(accessCode: string, instant: Date): Promise<IssuedSession | undefined> {
    const owner = await this.repository.findOwnerOfAccessCode(hashOf(accessCode));
    return owner === undefined ? undefined : this.openSession(owner, instant);
  }

  async signInWithPassword(
    email: string,
    password: string,
    instant: Date,
  ): Promise<IssuedSession | undefined> {
    const owner = await this.repository.findOwnerOfEmail(normalizeEmail(email));
    if (owner?.passwordHash === null || owner?.passwordHash === undefined) {
      await spendTimeLikeAVerification(password);
      return undefined;
    }
    return (await verifyPassword(password, owner.passwordHash))
      ? this.openSession(owner, instant)
      : undefined;
  }

  async setUpAccess(
    accessCode: string,
    email: string,
    password: string,
    instant: Date,
  ): Promise<AccessSetup> {
    if (password.length < MINIMUM_PASSWORD_LENGTH || password.length > MAXIMUM_PASSWORD_LENGTH) {
      return { status: 'WEAK_PASSWORD' };
    }
    const owner = await this.repository.findOwnerOfAccessCode(hashOf(accessCode));
    const normalized = normalizeEmail(email);
    if (owner === undefined) {
      await spendTimeLikeAVerification(password);
      return { status: 'REFUSED' };
    }
    const registered = await this.repository.findEmailOf(owner.memberId);
    if (registered !== undefined && registered !== normalized) {
      return { status: 'REFUSED' };
    }
    const stored = await this.repository.setPasswordAndConsumeCode(
      owner,
      normalized,
      await hashPassword(password),
    );
    return stored
      ? { status: 'SIGNED_IN', session: await this.openSession(owner, instant) }
      : { status: 'REFUSED' };
  }

  private async openSession(owner: SessionOwner, instant: Date): Promise<IssuedSession> {
    const token = newSecret();
    const { lifetimeInDays, maximumPerMember } = this.policy.sessions;
    const expiresAt = new Date(instant.getTime() + lifetimeInDays * MILLISECONDS_PER_DAY);
    await this.repository.deleteExpiredSessions(instant);
    await this.repository.createSession(owner, hashOf(token), expiresAt);
    await this.repository.keepNewestSessions(owner.memberId, maximumPerMember);
    return { token, expiresAt, memberName: owner.memberName };
  }

  async resolve(token: string, instant: Date): Promise<RequestContext | undefined> {
    const owner = await this.repository.findOwnerOfSession(hashOf(token), instant);
    return owner === undefined
      ? undefined
      : { ...owner, locale: localeOr(owner.locale), channel: 'web' };
  }

  async signOut(token: string): Promise<void> {
    await this.repository.deleteSession(hashOf(token));
  }
}
