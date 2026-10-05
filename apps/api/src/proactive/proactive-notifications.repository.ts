import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, exists, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import type { NotificationCandidate } from './proactive-candidates.js';
import {
  evaluationLeases,
  notificationDeliveries,
  proactiveNotifications,
} from './proactive-notifications.schema.js';

export type ProactiveNotification = typeof proactiveNotifications.$inferSelect;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NotificationStatus = ProactiveNotification['status'];

export interface DeliveryClaim {
  readonly notificationId: string;
  readonly householdId: string;
  readonly memberId: string;
  readonly channel: string;
  readonly level: number;
}

export const DELIVERY_EXHAUSTED = 'DELIVERY_EXHAUSTED';

@Injectable()
export class ProactiveNotificationsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async find(householdId: string, eventKey: string): Promise<ProactiveNotification | undefined> {
    const [notification] = await this.database
      .select()
      .from(proactiveNotifications)
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          eq(proactiveNotifications.eventKey, eventKey),
        ),
      );
    return notification;
  }

  async create(
    householdId: string,
    candidate: NotificationCandidate,
    status: NotificationStatus,
    statusReason: string | null,
    instant: Date,
  ): Promise<boolean> {
    const created = await this.database
      .insert(proactiveNotifications)
      .values({
        householdId,
        eventKey: candidate.eventKey,
        type: candidate.type,
        severity: candidate.severity,
        level: candidate.level,
        currency: candidate.currency,
        period: candidate.period,
        title: candidate.title,
        body: candidate.body,
        status,
        statusReason,
        firstDetectedAt: instant,
        lastDetectedAt: instant,
      })
      .onConflictDoNothing({
        target: [proactiveNotifications.householdId, proactiveNotifications.eventKey],
      })
      .returning({ id: proactiveNotifications.id });
    return created.length > 0;
  }

  async raise(
    householdId: string,
    candidate: NotificationCandidate,
    status: NotificationStatus,
    statusReason: string | null,
    instant: Date,
  ): Promise<boolean> {
    const raised = await this.database
      .update(proactiveNotifications)
      .set({
        type: candidate.type,
        severity: candidate.severity,
        level: candidate.level,
        title: candidate.title,
        body: candidate.body,
        status,
        statusReason,
        readAt: null,
        lastDetectedAt: instant,
        updatedAt: instant,
      })
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          eq(proactiveNotifications.eventKey, candidate.eventKey),
          lt(proactiveNotifications.level, candidate.level),
        ),
      )
      .returning({ id: proactiveNotifications.id });
    return raised.length > 0;
  }

  async touch(householdId: string, eventKey: string, instant: Date): Promise<void> {
    await this.database
      .update(proactiveNotifications)
      .set({ lastDetectedAt: instant })
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          eq(proactiveNotifications.eventKey, eventKey),
        ),
      );
  }

  async listDeliverable(
    householdId: string,
    maximumAttempts: number,
  ): Promise<ProactiveNotification[]> {
    const retryable = this.database
      .select({ id: notificationDeliveries.id })
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, proactiveNotifications.id),
          eq(notificationDeliveries.level, proactiveNotifications.level),
          eq(notificationDeliveries.status, 'FAILED'),
          lt(notificationDeliveries.attempts, maximumAttempts),
        ),
      );
    return this.database
      .select()
      .from(proactiveNotifications)
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          or(eq(proactiveNotifications.status, 'PENDING'), exists(retryable)),
        ),
      )
      .orderBy(proactiveNotifications.firstDetectedAt, proactiveNotifications.eventKey);
  }

  async countNotifiedSince(householdId: string, since: Date): Promise<number> {
    const [row] = await this.database
      .select({ total: sql<number>`count(*)::int` })
      .from(proactiveNotifications)
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          gt(proactiveNotifications.lastNotifiedAt, since),
        ),
      );
    return row?.total ?? 0;
  }

  async claimDelivery(
    claim: DeliveryClaim,
    maximumAttempts: number,
    instant: Date,
  ): Promise<boolean> {
    const claimed = await this.database
      .insert(notificationDeliveries)
      .values({ ...claim, status: 'SENDING' })
      .onConflictDoUpdate({
        target: [
          notificationDeliveries.notificationId,
          notificationDeliveries.memberId,
          notificationDeliveries.channel,
          notificationDeliveries.level,
        ],
        set: {
          status: 'SENDING',
          attempts: sql`${notificationDeliveries.attempts} + 1`,
          updatedAt: instant,
        },
        setWhere: sql`${notificationDeliveries.status} = 'FAILED' and ${notificationDeliveries.attempts} < ${maximumAttempts}`,
      })
      .returning({ id: notificationDeliveries.id });
    return claimed.length > 0;
  }

  async settleDelivery(
    claim: DeliveryClaim,
    status: 'SENT' | 'FAILED',
    instant: Date,
  ): Promise<void> {
    await this.database
      .update(notificationDeliveries)
      .set({ status, updatedAt: instant })
      .where(
        and(
          eq(notificationDeliveries.notificationId, claim.notificationId),
          eq(notificationDeliveries.memberId, claim.memberId),
          eq(notificationDeliveries.channel, claim.channel),
          eq(notificationDeliveries.level, claim.level),
        ),
      );
  }

  async listDeliveries(notificationId: string, level: number): Promise<NotificationDelivery[]> {
    return this.database
      .select()
      .from(notificationDeliveries)
      .where(
        and(
          eq(notificationDeliveries.notificationId, notificationId),
          eq(notificationDeliveries.level, level),
        ),
      );
  }

  async markOutcome(
    notificationId: string,
    status: NotificationStatus,
    statusReason: string | null,
    notifiedAt: Date | undefined,
    instant: Date,
  ): Promise<void> {
    await this.database
      .update(proactiveNotifications)
      .set({
        status,
        statusReason,
        updatedAt: instant,
        ...(notifiedAt === undefined ? {} : { lastNotifiedAt: notifiedAt }),
      })
      .where(eq(proactiveNotifications.id, notificationId));
  }

  async listRecent(householdId: string, limit: number): Promise<ProactiveNotification[]> {
    return this.database
      .select()
      .from(proactiveNotifications)
      .where(eq(proactiveNotifications.householdId, householdId))
      .orderBy(desc(proactiveNotifications.lastDetectedAt), desc(proactiveNotifications.level))
      .limit(limit);
  }

  async markRead(householdId: string, notificationId: string, instant: Date): Promise<boolean> {
    const read = await this.database
      .update(proactiveNotifications)
      .set({ readAt: instant })
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          eq(proactiveNotifications.id, notificationId),
          isNull(proactiveNotifications.readAt),
        ),
      )
      .returning({ id: proactiveNotifications.id });
    if (read.length > 0) {
      return true;
    }
    const [existing] = await this.database
      .select({ id: proactiveNotifications.id })
      .from(proactiveNotifications)
      .where(
        and(
          eq(proactiveNotifications.householdId, householdId),
          eq(proactiveNotifications.id, notificationId),
        ),
      );
    return existing !== undefined;
  }

  async acquireLease(name: string, holder: string, instant: Date, until: Date): Promise<boolean> {
    const acquired = await this.database
      .insert(evaluationLeases)
      .values({ name, holder, lockedUntil: until })
      .onConflictDoUpdate({
        target: evaluationLeases.name,
        set: { holder, lockedUntil: until },
        setWhere: lt(evaluationLeases.lockedUntil, instant),
      })
      .returning({ name: evaluationLeases.name });
    return acquired.length > 0;
  }

  async releaseLease(name: string, holder: string): Promise<void> {
    await this.database
      .delete(evaluationLeases)
      .where(and(eq(evaluationLeases.name, name), eq(evaluationLeases.holder, holder)));
  }
}
