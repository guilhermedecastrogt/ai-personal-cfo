import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, lte, notInArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { households, members } from '../households/households.schema.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { dashboardSessions, memberAccessCodes, memberCredentials } from './auth.schema.js';

export interface SessionOwner {
  readonly householdId: string;
  readonly memberId: string;
  readonly memberName: string;
}

@Injectable()
export class AuthRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async replaceAccessCode(householdId: string, memberId: string, codeHash: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .insert(memberAccessCodes)
        .values({ householdId, memberId, codeHash })
        .onConflictDoUpdate({ target: memberAccessCodes.memberId, set: { codeHash } });
      await transaction
        .delete(dashboardSessions)
        .where(
          and(
            eq(dashboardSessions.householdId, householdId),
            eq(dashboardSessions.memberId, memberId),
          ),
        );
    });
  }

  async revokeAccess(householdId: string, memberId: string): Promise<void> {
    await this.database.transaction(async (transaction) => {
      await transaction
        .delete(memberAccessCodes)
        .where(
          and(
            eq(memberAccessCodes.householdId, householdId),
            eq(memberAccessCodes.memberId, memberId),
          ),
        );
      await transaction
        .delete(dashboardSessions)
        .where(
          and(
            eq(dashboardSessions.householdId, householdId),
            eq(dashboardSessions.memberId, memberId),
          ),
        );
      await transaction
        .delete(memberCredentials)
        .where(
          and(
            eq(memberCredentials.householdId, householdId),
            eq(memberCredentials.memberId, memberId),
          ),
        );
    });
  }

  async registerEmail(householdId: string, memberId: string, email: string): Promise<void> {
    await this.database
      .insert(memberCredentials)
      .values({ householdId, memberId, email })
      .onConflictDoUpdate({
        target: memberCredentials.memberId,
        set: { email, updatedAt: new Date() },
      });
  }

  async findEmailOf(memberId: string): Promise<string | undefined> {
    const [credential] = await this.database
      .select({ email: memberCredentials.email })
      .from(memberCredentials)
      .where(eq(memberCredentials.memberId, memberId));
    return credential?.email;
  }

  async findOwnerOfEmail(
    email: string,
  ): Promise<(SessionOwner & { passwordHash: string | null }) | undefined> {
    const [owner] = await this.database
      .select({
        householdId: members.householdId,
        memberId: members.id,
        memberName: members.name,
        passwordHash: memberCredentials.passwordHash,
      })
      .from(memberCredentials)
      .innerJoin(members, eq(members.id, memberCredentials.memberId))
      .where(eq(memberCredentials.email, email));
    return owner;
  }

  async setPasswordAndConsumeCode(
    owner: SessionOwner,
    email: string,
    passwordHash: string,
  ): Promise<boolean> {
    try {
      await this.database.transaction(async (transaction) => {
        await transaction
          .insert(memberCredentials)
          .values({ householdId: owner.householdId, memberId: owner.memberId, email, passwordHash })
          .onConflictDoUpdate({
            target: memberCredentials.memberId,
            set: { email, passwordHash, updatedAt: new Date() },
          });
        await transaction
          .delete(memberAccessCodes)
          .where(
            and(
              eq(memberAccessCodes.householdId, owner.householdId),
              eq(memberAccessCodes.memberId, owner.memberId),
            ),
          );
        await transaction
          .delete(dashboardSessions)
          .where(
            and(
              eq(dashboardSessions.householdId, owner.householdId),
              eq(dashboardSessions.memberId, owner.memberId),
            ),
          );
      });
      return true;
    } catch (error) {
      if (isUniqueViolation(error)) {
        return false;
      }
      throw error;
    }
  }

  async keepNewestSessions(memberId: string, maximum: number): Promise<void> {
    const newest = this.database
      .select({ id: dashboardSessions.id })
      .from(dashboardSessions)
      .where(eq(dashboardSessions.memberId, memberId))
      .orderBy(desc(dashboardSessions.createdAt), desc(dashboardSessions.id))
      .limit(maximum);
    await this.database
      .delete(dashboardSessions)
      .where(
        and(eq(dashboardSessions.memberId, memberId), notInArray(dashboardSessions.id, newest)),
      );
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

  async findOwnerOfSession(
    tokenHash: string,
    instant: Date,
  ): Promise<(SessionOwner & { locale: string }) | undefined> {
    const [owner] = await this.database
      .select({
        householdId: members.householdId,
        memberId: members.id,
        memberName: members.name,
        locale: households.locale,
      })
      .from(dashboardSessions)
      .innerJoin(members, eq(members.id, dashboardSessions.memberId))
      .innerJoin(households, eq(households.id, members.householdId))
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
