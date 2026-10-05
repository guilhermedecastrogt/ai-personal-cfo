import type { CurrencyAnalysis } from '../cfo/cfo.service.js';
import { describeResult, type NameDirectory } from '../cfo/context/result-description.js';
import { ALL_SPENDING_LABEL } from '../cfo/context/review-context.js';
import { describeInsights } from '../cfo/context/signal-descriptions.js';
import type { Insight, InsightSeverity } from '../finance/domain/insights/insight-engine.js';
import { daysBetween, type IsoDate } from '../finance/domain/period/period.js';
import { severityRank, type ProactivePolicy } from './proactive-policy.js';

export const PROACTIVE_EVENT_TYPES = [
  'BUDGET_NEAR_LIMIT',
  'BUDGET_EXCEEDED',
  'BUDGET_FORECAST_RISK',
  'SPENDING_INCREASE',
  'UNUSUAL_SPENDING',
  'RECURRING_EXPENSE',
  'RECURRING_EXPENSE_DUE',
  'GOAL_PROGRESS',
  'CASH_FLOW_WARNING',
] as const;

export type ProactiveEventType = (typeof PROACTIVE_EVENT_TYPES)[number];

export interface NotificationCandidate {
  readonly eventKey: string;
  readonly type: ProactiveEventType;
  readonly severity: InsightSeverity;
  readonly level: number;
  readonly currency: string;
  readonly period: string;
  readonly title: string;
  readonly body: string;
}

const MONTH_KEY_LENGTH = 7;
const BUDGET_NEAR_LEVEL = 1;
const BUDGET_CLOSE_LEVEL = 2;
const BUDGET_EXCEEDED_LEVEL = 3;
const BUDGET_CRITICAL_LEVEL = 4;

type Facts = Readonly<Record<string, unknown>>;

function text(facts: Facts, key: string): string {
  const value = facts[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
}

function budgetLevel(
  insight: Extract<Insight, { type: 'BUDGET_NEAR_LIMIT' | 'BUDGET_EXCEEDED' }>,
  policy: ProactivePolicy,
): number {
  if (insight.type === 'BUDGET_EXCEEDED') {
    return insight.severity === 'CRITICAL' ? BUDGET_CRITICAL_LEVEL : BUDGET_EXCEEDED_LEVEL;
  }
  return insight.evidence.usageBasisPoints >= policy.budgetEscalationBasisPoints
    ? BUDGET_CLOSE_LEVEL
    : BUDGET_NEAR_LEVEL;
}

function identityOf(insight: Insight, policy: ProactivePolicy): { key: string; level: number } {
  if (insight.type === 'BUDGET_NEAR_LIMIT' || insight.type === 'BUDGET_EXCEEDED') {
    return {
      key: `BUDGET:${insight.evidence.budgetId}:${insight.evidence.period.start}`,
      level: budgetLevel(insight, policy),
    };
  }
  return { key: insight.key, level: severityRank(insight.severity) + 1 };
}

export function buildCandidates(
  analysis: CurrencyAnalysis,
  directory: NameDirectory,
  today: IsoDate,
  policy: ProactivePolicy,
): NotificationCandidate[] {
  const { review } = analysis;
  const period = review.month.start.slice(0, MONTH_KEY_LENGTH);
  const shared = { currency: review.currency, period };
  const descriptions = describeInsights(review.insights, directory);
  const fromInsights = review.insights.map((insight, position): NotificationCandidate => {
    const identity = identityOf(insight, policy);
    return {
      ...shared,
      eventKey: `${review.currency}:${identity.key}`,
      type: insight.type,
      severity: insight.severity,
      level: identity.level,
      title: descriptions[position]?.title ?? insight.type,
      body: descriptions[position]?.detail ?? '',
    };
  });
  const forecastRisks = review.budgets
    .filter((budget) => budget.isProjectedOverLimit && budget.status === 'ON_TRACK')
    .map((budget): NotificationCandidate => {
      const facts = describeResult({ currency: review.currency, ...budget }, directory) as Facts;
      const scope = budget.categoryId === null ? ALL_SPENDING_LABEL : text(facts, 'category');
      return {
        ...shared,
        eventKey: `${review.currency}:BUDGET_FORECAST:${budget.budgetId}:${review.month.start}`,
        type: 'BUDGET_FORECAST_RISK',
        severity: 'MEDIUM',
        level: severityRank('MEDIUM') + 1,
        title: `${scope} budget is projected to run over`,
        body: `At the current pace it would reach ${text(facts, 'projectedTotal')} against a limit of ${text(facts, 'limit')}.`,
      };
    });
  const dueSoon = review.recurring.commitments
    .filter((commitment) => {
      const daysAway = daysBetween(today, commitment.nextExpectedDate);
      return daysAway >= 0 && daysAway <= policy.recurringDueWithinDays;
    })
    .map((commitment): NotificationCandidate => {
      const facts = describeResult(
        { currency: review.currency, ...commitment },
        directory,
      ) as Facts;
      return {
        ...shared,
        eventKey: `${review.currency}:RECURRING_DUE:${commitment.merchant.toLowerCase()}:${commitment.nextExpectedDate}`,
        type: 'RECURRING_EXPENSE_DUE',
        severity: 'LOW',
        level: severityRank('LOW') + 1,
        title: `${commitment.merchant} is expected soon`,
        body: `Usually ${text(facts, 'typicalAmount')}, expected around ${commitment.nextExpectedDate}.`,
      };
    });
  return [...fromInsights, ...forecastRisks, ...dueSoon];
}
