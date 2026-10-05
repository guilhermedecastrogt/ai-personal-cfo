import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { CfoService } from '../cfo/cfo.service.js';
import type { InsightSeverity } from '../finance/domain/insights/insight-engine.js';
import { currentDateIn, currentHourIn, monthContaining } from '../finance/domain/period/period.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import {
  NOTIFICATION_CHANNEL,
  NotificationDeliveryError,
  type NotificationChannel,
} from './notification-channel.js';
import { NotificationComposer } from './notification-composer.js';
import { buildCandidates, type NotificationCandidate } from './proactive-candidates.js';
import {
  DELIVERY_EXHAUSTED,
  ProactiveNotificationsRepository,
  type ProactiveNotification,
} from './proactive-notifications.repository.js';
import {
  decideNotification,
  deliveryHold,
  PROACTIVE_POLICY,
  severityRank,
} from './proactive-policy.js';

export interface HouseholdEvaluation {
  readonly detected: number;
  readonly delivered: number;
  readonly failed: number;
}

export type EvaluationRun =
  | { readonly status: 'SKIPPED' }
  | {
      readonly status: 'COMPLETED';
      readonly households: number;
      readonly failedHouseholds: number;
      readonly delivered: number;
    };

const LEASE_NAME = 'proactive-evaluation';
const RECENT_NOTIFICATIONS = 50;
const NO_RECIPIENT = 'NO_RECIPIENT';
const MILLISECONDS_PER_MINUTE = 60_000;
const MILLISECONDS_PER_DAY = 86_400_000;

@Injectable()
export class ProactiveCfoService {
  private readonly policy = PROACTIVE_POLICY;
  private readonly logger = new Logger(ProactiveCfoService.name);
  private readonly holder = randomUUID();

  constructor(
    private readonly cfo: CfoService,
    private readonly households: HouseholdsRepository,
    private readonly notifications: ProactiveNotificationsRepository,
    private readonly composer: NotificationComposer,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
  ) {}

  async evaluateAll(instant: Date): Promise<EvaluationRun> {
    const until = new Date(
      instant.getTime() + this.policy.leaseInMinutes * MILLISECONDS_PER_MINUTE,
    );
    if (!(await this.notifications.acquireLease(LEASE_NAME, this.holder, instant, until))) {
      return { status: 'SKIPPED' };
    }
    try {
      const households = await this.households.listHouseholds();
      let failedHouseholds = 0;
      let delivered = 0;
      for (const household of households) {
        try {
          delivered += (await this.evaluateHousehold(household.id, instant)).delivered;
        } catch (error) {
          failedHouseholds += 1;
          this.logger.error(
            `Proactive evaluation failed for a household: ${error instanceof Error ? error.name : 'unknown'}`,
          );
        }
      }
      return { status: 'COMPLETED', households: households.length, failedHouseholds, delivered };
    } finally {
      await this.notifications.releaseLease(LEASE_NAME, this.holder);
    }
  }

  async evaluateHousehold(householdId: string, instant: Date): Promise<HouseholdEvaluation> {
    const household = await this.households.findHousehold(householdId);
    if (household === undefined) {
      return { detected: 0, delivered: 0, failed: 0 };
    }
    const today = currentDateIn(household.timezone, instant);
    const analysis = await this.cfo.monthlyAnalysis(
      { householdId },
      { month: monthContaining(today), today },
    );
    const candidates = analysis.analyses.flatMap((currency) =>
      buildCandidates(currency, analysis.directory, today, this.policy),
    );
    for (const candidate of candidates) {
      await this.register(householdId, candidate, instant);
    }
    const outcome = await this.deliver(
      householdId,
      currentHourIn(household.timezone, instant),
      instant,
    );
    return { detected: candidates.length, ...outcome };
  }

  recent(householdId: string): Promise<ProactiveNotification[]> {
    return this.notifications.listRecent(householdId, RECENT_NOTIFICATIONS);
  }

  markRead(householdId: string, notificationId: string, instant: Date): Promise<boolean> {
    return this.notifications.markRead(householdId, notificationId, instant);
  }

  async suppressForBudget(householdId: string, budgetId: string, instant: Date): Promise<void> {
    const suppressed = await this.notifications.suppressForBudget(householdId, budgetId, instant);
    if (suppressed > 0) {
      this.logger.log(
        `event=notifications-suppressed reason=budget-removed count=${String(suppressed)}`,
      );
    }
  }

  private async register(
    householdId: string,
    candidate: NotificationCandidate,
    instant: Date,
  ): Promise<void> {
    const existing = await this.notifications.find(householdId, candidate.eventKey);
    const decision = decideNotification(candidate, existing, instant, this.policy);
    if (decision.action === 'NOTIFY') {
      await (existing === undefined
        ? this.notifications.create(householdId, candidate, 'PENDING', null, instant)
        : this.notifications.raise(householdId, candidate, 'PENDING', null, instant));
      return;
    }
    if (!decision.recordLevel) {
      await this.notifications.touch(householdId, candidate.eventKey, instant);
      return;
    }
    await (existing === undefined
      ? this.notifications.create(householdId, candidate, 'SUPPRESSED', decision.reason, instant)
      : this.notifications.raise(householdId, candidate, 'SUPPRESSED', decision.reason, instant));
  }

  private async deliver(
    householdId: string,
    localHour: number,
    instant: Date,
  ): Promise<{ delivered: number; failed: number }> {
    const deliverable = (
      await this.notifications.listDeliverable(householdId, this.policy.maximumDeliveryAttempts)
    ).sort(
      (left, right) =>
        severityRank(right.severity as InsightSeverity) -
        severityRank(left.severity as InsightSeverity),
    );
    if (deliverable.length === 0) {
      return { delivered: 0, failed: 0 };
    }
    const recipients = await this.channel.recipients(householdId);
    let notifiedToday = await this.notifications.countNotifiedSince(
      householdId,
      new Date(instant.getTime() - MILLISECONDS_PER_DAY),
    );
    let delivered = 0;
    let failed = 0;
    for (const notification of deliverable) {
      if (recipients.length === 0) {
        await this.notifications.markOutcome(
          notification.id,
          'SUPPRESSED',
          NO_RECIPIENT,
          undefined,
          instant,
        );
        continue;
      }
      const hold = deliveryHold(
        notification.severity as InsightSeverity,
        localHour,
        notifiedToday,
        this.policy,
      );
      if (hold !== undefined) {
        if (notification.status === 'PENDING') {
          await this.notifications.markOutcome(
            notification.id,
            'PENDING',
            hold,
            undefined,
            instant,
          );
        }
        continue;
      }
      const wasNotified = notification.status === 'SENT';
      const outcome = await this.send(notification, recipients, instant);
      if (outcome === 'SENT' && !wasNotified) {
        notifiedToday += 1;
        delivered += 1;
      }
      if (outcome === 'FAILED') {
        failed += 1;
      }
    }
    return { delivered, failed };
  }

  private async send(
    notification: ProactiveNotification,
    recipients: readonly { memberId: string; memberName: string }[],
    instant: Date,
  ): Promise<'SENT' | 'FAILED' | 'IN_FLIGHT'> {
    for (const recipient of recipients) {
      const claim = {
        notificationId: notification.id,
        householdId: notification.householdId,
        memberId: recipient.memberId,
        channel: this.channel.name,
        level: notification.level,
      };
      if (
        await this.notifications.claimDelivery(claim, this.policy.maximumDeliveryAttempts, instant)
      ) {
        await this.notifications.settleDelivery(
          claim,
          await this.attempt(notification, recipient),
          instant,
        );
      }
    }
    const deliveries = await this.notifications.listDeliveries(notification.id, notification.level);
    const isSent = deliveries.some((delivery) => delivery.status === 'SENT');
    const isInFlight = deliveries.some((delivery) => delivery.status === 'SENDING');
    const canRetry = deliveries.some(
      (delivery) =>
        delivery.status === 'FAILED' && delivery.attempts < this.policy.maximumDeliveryAttempts,
    );
    if (isSent) {
      await this.notifications.markOutcome(
        notification.id,
        'SENT',
        null,
        notification.status === 'SENT' ? undefined : instant,
        instant,
      );
      return 'SENT';
    }
    if (isInFlight) {
      return 'IN_FLIGHT';
    }
    await this.notifications.markOutcome(
      notification.id,
      'FAILED',
      canRetry ? null : DELIVERY_EXHAUSTED,
      undefined,
      instant,
    );
    return 'FAILED';
  }

  private async attempt(
    notification: ProactiveNotification,
    recipient: { memberId: string; memberName: string },
  ): Promise<'SENT' | 'FAILED'> {
    try {
      const text = await this.composer.compose(notification, recipient.memberName);
      await this.channel.deliver({
        householdId: notification.householdId,
        memberId: recipient.memberId,
        text,
      });
      return 'SENT';
    } catch (error) {
      if (error instanceof NotificationDeliveryError) {
        return 'FAILED';
      }
      this.logger.error(
        `Proactive delivery failed: ${error instanceof Error ? error.name : 'unknown'}`,
      );
      return 'FAILED';
    }
  }
}
