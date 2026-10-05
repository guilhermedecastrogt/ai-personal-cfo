import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, lte } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { members } from '../households/households.schema.js';
import { dashboardSessions, memberAccessCodes } from './auth.schema.js';

export interface SessionOwner {
  readonly householdId: string;
  readonly memberId: string;
  readonly memberName: string;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async saveAccessCode(householdId: string, memberId: string, codeHash: string): Promise<void> {
    await this.database
      .insert(memberAccessCodes)
      .values({ householdId, memberId, codeHash })
      .onConflictDoUpdate({ target: memberAccessCodes.memberId, set: { codeHash } });
  }

  async findOwnerOfAccessCode(codeHash: string): Promise<SessionOwner | undefined> {
    const [owner] = await this.database
      .select({
        householdId: members.householdId,
        memberId: members.id,
        memberName: members.name,
      })
      .from(memberAccessCodes)
      .innerJoin(members, eq(members.id, memberAccessCodes.memberId))
      .where(eq(memberAccessCodes.codeHash, codeHash));
    return owner;
  }

  async createSession(owner: SessionOwner, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.database.insert(dashboardSessions).values({
      householdId: owner.householdId,
      memberId: owner.memberId,
      tokenHash,
      expiresAt,
    });
  }

  async findOwnerOfSession(tokenHash: string, instant: Date): Promise<SessionOwner | undefined> {
    const [owner] = await this.database
      .select({
        householdId: members.householdId,
        memberId: members.id,
        memberName: members.name,
      })
      .from(dashboardSessions)
      .innerJoin(members, eq(members.id, dashboardSessions.memberId))
      .where(
        and(eq(dashboardSessions.tokenHash, tokenHash), gt(dashboardSessions.expiresAt, instant)),
      );
    return owner;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.database.delete(dashboardSessions).where(eq(dashboardSessions.tokenHash, tokenHash));
  }

  async deleteExpiredSessions(instant: Date): Promise<void> {
    await this.database.delete(dashboardSessions).where(lte(dashboardSessions.expiresAt, instant));
  }
}
