import {
  INSIGHT_SEVERITIES,
  type InsightSeverity,
} from '../finance/domain/insights/insight-engine.js';

export interface ProactivePolicy {
  readonly minimumSeverity: InsightSeverity;
  readonly cooldownInHours: number;
  readonly maximumDeliveriesPerDay: number;
  readonly quietHours: { readonly startHour: number; readonly endHour: number };
  readonly budgetEscalationBasisPoints: number;
  readonly recurringDueWithinDays: number;
  readonly maximumDeliveryAttempts: number;
  readonly evaluationIntervalInMinutes: number;
  readonly leaseInMinutes: number;
  readonly maximumMessageLength: number;
}

export const PROACTIVE_POLICY: ProactivePolicy = {
  minimumSeverity: 'MEDIUM',
  cooldownInHours: 12,
  maximumDeliveriesPerDay: 3,
  quietHours: { startHour: 22, endHour: 8 },
  budgetEscalationBasisPoints: 9_000,
  recurringDueWithinDays: 3,
  maximumDeliveryAttempts: 3,
  evaluationIntervalInMinutes: 60,
  leaseInMinutes: 10,
  maximumMessageLength: 500,
};

export type SuppressionReason = 'BELOW_SEVERITY' | 'ALREADY_NOTIFIED' | 'COOLDOWN';

export type NotificationDecision =
  | { readonly action: 'NOTIFY'; readonly escalation: boolean }
  | {
      readonly action: 'SUPPRESS';
      readonly reason: SuppressionReason;
      readonly recordLevel: boolean;
    };

export interface EventCandidate {
  readonly severity: InsightSeverity;
  readonly level: number;
}

export interface EventState {
  readonly level: number;
  readonly lastNotifiedAt: Date | null;
}

const MILLISECONDS_PER_HOUR = 3_600_000;

export function severityRank(severity: InsightSeverity): number {
  return INSIGHT_SEVERITIES.indexOf(severity);
}

export function decideNotification(
  candidate: EventCandidate,
  existing: EventState | undefined,
  instant: Date,
  policy: ProactivePolicy,
): NotificationDecision {
  const isNotable = severityRank(candidate.severity) >= severityRank(policy.minimumSeverity);
  if (existing !== undefined && candidate.level <= existing.level) {
    return { action: 'SUPPRESS', reason: 'ALREADY_NOTIFIED', recordLevel: false };
  }
  if (!isNotable) {
    return { action: 'SUPPRESS', reason: 'BELOW_SEVERITY', recordLevel: true };
  }
  if (existing === undefined) {
    return { action: 'NOTIFY', escalation: false };
  }
  const sinceLast =
    existing.lastNotifiedAt === null
      ? Number.POSITIVE_INFINITY
      : instant.getTime() - existing.lastNotifiedAt.getTime();
  const isCoolingDown = sinceLast < policy.cooldownInHours * MILLISECONDS_PER_HOUR;
  if (isCoolingDown && candidate.severity !== 'CRITICAL') {
    return { action: 'SUPPRESS', reason: 'COOLDOWN', recordLevel: false };
  }
  return { action: 'NOTIFY', escalation: true };
}

export type DeliveryHold = 'QUIET_HOURS' | 'DAILY_LIMIT';

export function deliveryHold(
  severity: InsightSeverity,
  localHour: number,
  deliveredToday: number,
  policy: ProactivePolicy,
): DeliveryHold | undefined {
  if (severity === 'CRITICAL') {
    return undefined;
  }
  const { startHour, endHour } = policy.quietHours;
  const isQuiet =
    startHour > endHour
      ? localHour >= startHour || localHour < endHour
      : localHour >= startHour && localHour < endHour;
  if (isQuiet) {
    return 'QUIET_HOURS';
  }
  return deliveredToday >= policy.maximumDeliveriesPerDay ? 'DAILY_LIMIT' : undefined;
}
