import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { platformActions, platformAdmins } from './platform.schema.js';

export const PLATFORM_ACTIONS = [
  'HOUSEHOLD_CREATED',
  'HOUSEHOLD_UPDATED',
  'MEMBER_ADDED',
  'EMAIL_REGISTERED',
  'INVITATION_ISSUED',
  'ACCESS_REVOKED',
  'WHATSAPP_IDENTITY_ADDED',
  'WHATSAPP_IDENTITY_REMOVED',
  'ADMIN_GRANTED',
  'ADMIN_REVOKED',
  'WELCOME_SENT',
] as const;

export type PlatformAction = (typeof PLATFORM_ACTIONS)[number];

export interface PlatformAdmin {
  readonly householdId: string;
  readonly memberId: string;
  readonly grantedAt: Date;
}

export interface RecordedAction {
  readonly actorMemberId: string;
  readonly action: PlatformAction;
  readonly householdId?: string | undefined;
  readonly memberId?: string | undefined;
}

@Injectable()
export class PlatformAdminsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async isAdmin(householdId: string, memberId: string): Promise<boolean> {
    const [admin] = await this.database
      .select({ memberId: platformAdmins.memberId })
      .from(platformAdmins)
      .where(
        and(eq(platformAdmins.householdId, householdId), eq(platformAdmins.memberId, memberId)),
      );
    return admin !== undefined;
  }

  async list(): Promise<PlatformAdmin[]> {
    return this.database
      .select({
        householdId: platformAdmins.householdId,
        memberId: platformAdmins.memberId,
        grantedAt: platformAdmins.createdAt,
      })
      .from(platformAdmins)
      .orderBy(asc(platformAdmins.createdAt), asc(platformAdmins.memberId));
  }

  async count(): Promise<number> {
    return this.database.$count(platformAdmins);
  }

  async grant(
    householdId: string,
    memberId: string,
    grantedByMemberId: string | null,
  ): Promise<boolean> {
    const inserted = await this.database
      .insert(platformAdmins)
      .values({ householdId, memberId, grantedByMemberId })
      .onConflictDoNothing()
      .returning({ memberId: platformAdmins.memberId });
    return inserted.length > 0;
  }

  async revoke(householdId: string, memberId: string): Promise<boolean> {
    const removed = await this.database
      .delete(platformAdmins)
      .where(
        and(eq(platformAdmins.householdId, householdId), eq(platformAdmins.memberId, memberId)),
      )
      .returning({ memberId: platformAdmins.memberId });
    return removed.length > 0;
  }

  async record(action: RecordedAction): Promise<void> {
    await this.database.insert(platformActions).values({
      actorMemberId: action.actorMemberId,
      action: action.action,
      householdId: action.householdId ?? null,
      memberId: action.memberId ?? null,
    });
  }
}
