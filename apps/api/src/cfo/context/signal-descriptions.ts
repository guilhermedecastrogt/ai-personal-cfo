import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { Insight } from '../../finance/domain/insights/insight-engine.js';
import { describeResult, type NameDirectory } from './result-description.js';

export interface SignalDescription {
  readonly type: string;
  readonly severity: Insight['severity'];
  readonly title: string;
  readonly detail: string;
  readonly date: string | null;
}

type Facts = Readonly<Record<string, unknown>>;

const ANOMALY_SEVERITY = 'MEDIUM';
const ALL_SPENDING = 'All spending';

function text(facts: Facts, key: string): string {
  const value = facts[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
}

function describeAnomaly(anomaly: Anomaly, facts: Facts): Omit<SignalDescription, 'severity'> {
  if (anomaly.type === 'UNUSUALLY_LARGE_TRANSACTION') {
    const merchant = anomaly.merchant ?? 'an unnamed merchant';
    return {
      type: anomaly.type,
      title: `Unusually large ${text(facts, 'category')} expense`,
      detail: `${text(facts, 'amount')} at ${merchant}, against a usual ${text(facts, 'baselineAmount')}.`,
      date: anomaly.date,
    };
  }
  return {
    type: anomaly.type,
    title: `Unusually high ${text(facts, 'category')} spending`,
    detail: `${text(facts, 'currentAmount')} so far, against a usual ${text(facts, 'baselineAmount')} by this point.`,
    date: null,
  };
}

export function describeAnomalies(
  anomalies: readonly Anomaly[],
  directory: NameDirectory,
): SignalDescription[] {
  return anomalies.map((anomaly) => ({
    ...describeAnomaly(anomaly, describeResult(anomaly, directory) as Facts),
    severity: ANOMALY_SEVERITY,
  }));
}

function describeInsight(
  insight: Insight,
  directory: NameDirectory,
): Omit<SignalDescription, 'severity'> {
  const facts = describeResult(insight.evidence, directory) as Facts;
  const date = null;
  switch (insight.type) {
    case 'BUDGET_NEAR_LIMIT':
    case 'BUDGET_EXCEEDED': {
      const scope = insight.evidence.categoryId === null ? ALL_SPENDING : text(facts, 'category');
      const state = insight.type === 'BUDGET_EXCEEDED' ? 'exceeded' : 'near its limit';
      return {
        type: insight.type,
        title: `${scope} budget ${state}`,
        detail: `${text(facts, 'spent')} of ${text(facts, 'limit')} spent (${text(facts, 'usage')}).`,
        date,
      };
    }
    case 'SPENDING_INCREASE':
      return {
        type: insight.type,
        title: `${text(facts, 'category')} spending is up`,
        detail: `${text(facts, 'current')} against ${text(facts, 'previous')} in the previous period (${text(facts, 'change')}).`,
        date,
      };
    case 'UNUSUAL_SPENDING':
      return describeAnomaly(insight.evidence, facts);
    case 'RECURRING_EXPENSE':
      return {
        type: insight.type,
        title: `${insight.evidence.merchant} recurs ${insight.evidence.frequency.toLowerCase()}`,
        detail: `Typically ${text(facts, 'typicalAmount')}. Last charged on ${insight.evidence.lastDate}.`,
        date: insight.evidence.lastDate,
      };
    case 'NEW_RECURRING_EXPENSE':
      return {
        type: insight.type,
        title: `New recurring expense: ${insight.evidence.merchant}`,
        detail: `${text(facts, 'typicalAmount')} ${insight.evidence.frequency.toLowerCase()}, charged ${String(insight.evidence.occurrences)} times since ${insight.evidence.firstDate}.`,
        date: insight.evidence.establishedOn,
      };
    case 'RECURRING_PRICE_INCREASE': {
      const change = (facts.priceChange ?? {}) as Facts;
      return {
        type: insight.type,
        title: `${insight.evidence.merchant} costs more`,
        detail: `Now ${text(change, 'currentAmount')}, previously ${text(change, 'previousAmount')} (${text(change, 'change')} more), since ${text(change, 'effectiveDate')}.`,
        date: insight.evidence.priceChange?.effectiveDate ?? null,
      };
    }
    case 'RECURRING_EXPENSE_STOPPED':
      return {
        type: insight.type,
        title: `${insight.evidence.merchant} appears to have stopped`,
        detail: `Usually ${text(facts, 'typicalAmount')} ${insight.evidence.frequency.toLowerCase()}. Last charged on ${insight.evidence.lastDate}, and nothing since it was expected on ${insight.evidence.nextExpectedDate}.`,
        date: insight.evidence.lastDate,
      };
    case 'GOAL_PROGRESS':
      return {
        type: insight.type,
        title: `Goal ${text(facts, 'goal')} is ${insight.evidence.state === 'COMPLETED' ? 'complete' : 'overdue'}`,
        detail: `${text(facts, 'current')} saved of ${text(facts, 'target')} (${text(facts, 'progress')}).`,
        date: insight.evidence.targetDate,
      };
    case 'CASH_FLOW_WARNING':
      return {
        type: insight.type,
        title: 'Projected spending exceeds expected income',
        detail: `${text(facts, 'projectedExpenses')} projected against ${text(facts, 'expectedIncome')} expected.`,
        date,
      };
  }
}

export function describeInsights(
  insights: readonly Insight[],
  directory: NameDirectory,
): SignalDescription[] {
  return insights.map((insight) => ({
    ...describeInsight(insight, directory),
    severity: insight.severity,
  }));
}
