import { isAtLeastRatio } from '../../../money/money-math.js';
import type { Anomaly } from '../anomaly/anomaly-detector.js';
import type { BudgetUsage } from '../budget/budget-usage.js';
import type { CashFlowOutlook } from '../cash-flow/cash-flow.js';
import type { FinancePolicy } from '../finance-policy.js';
import type { GoalProgress } from '../goals/goal-progress.js';
import type { RecurringExpensePattern } from '../recurring/recurring-expense-detector.js';
import type { CategoryTrend, SpendingTrends } from '../trends/spending-trends.js';

export const INSIGHT_SEVERITIES = ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type InsightSeverity = (typeof INSIGHT_SEVERITIES)[number];

interface InsightBase {
  readonly severity: InsightSeverity;
  readonly key: string;
}

export type Insight =
  | (InsightBase & { readonly type: 'BUDGET_NEAR_LIMIT'; readonly evidence: BudgetUsage })
  | (InsightBase & { readonly type: 'BUDGET_EXCEEDED'; readonly evidence: BudgetUsage })
  | (InsightBase & {
      readonly type: 'SPENDING_INCREASE';
      readonly evidence: CategoryTrend & {
        readonly currency: string;
        readonly currentPeriod: SpendingTrends['currentPeriod'];
        readonly previousPeriod: SpendingTrends['previousPeriod'];
      };
    })
  | (InsightBase & { readonly type: 'UNUSUAL_SPENDING'; readonly evidence: Anomaly })
  | (InsightBase & {
      readonly type: 'RECURRING_EXPENSE';
      readonly evidence: RecurringExpensePattern;
    })
  | (InsightBase & { readonly type: 'GOAL_PROGRESS'; readonly evidence: GoalProgress })
  | (InsightBase & { readonly type: 'CASH_FLOW_WARNING'; readonly evidence: CashFlowOutlook });

export type InsightType = Insight['type'];

export interface InsightInputs {
  readonly budgets?: readonly BudgetUsage[];
  readonly trends?: SpendingTrends;
  readonly anomalies?: readonly Anomaly[];
  readonly recurringExpenses?: readonly RecurringExpensePattern[];
  readonly goals?: readonly GoalProgress[];
  readonly cashFlowOutlook?: CashFlowOutlook;
}

export function evaluateInsights(
  inputs: InsightInputs,
  policy: FinancePolicy['insights'],
): Insight[] {
  return [
    ...(inputs.budgets ?? []).flatMap((usage) => budgetInsights(usage, policy)),
    ...(inputs.trends === undefined ? [] : spendingIncreaseInsights(inputs.trends, policy)),
    ...(inputs.anomalies ?? []).map(anomalyInsight),
    ...(inputs.recurringExpenses ?? []).map(recurringExpenseInsight),
    ...(inputs.goals ?? []).flatMap(goalInsights),
    ...(inputs.cashFlowOutlook === undefined ? [] : cashFlowInsights(inputs.cashFlowOutlook)),
  ].sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
}

export function isAtLeast(severity: InsightSeverity, minimum: InsightSeverity): boolean {
  return severityRank(severity) >= severityRank(minimum);
}

export function selectNotable(
  insights: readonly Insight[],
  minimumSeverity: InsightSeverity,
): Insight[] {
  return insights.filter((insight) => isAtLeast(insight.severity, minimumSeverity));
}

function severityRank(severity: InsightSeverity): number {
  return INSIGHT_SEVERITIES.indexOf(severity);
}

function budgetInsights(usage: BudgetUsage, policy: FinancePolicy['insights']): Insight[] {
  const subject = `${usage.budgetId}:${usage.period.start}`;
  if (usage.status === 'EXCEEDED') {
    const isCritical = isAtLeastRatio(
      usage.spentMinor,
      usage.limitMinor,
      policy.criticalBudgetUsageBasisPoints,
    );
    return [
      {
        type: 'BUDGET_EXCEEDED',
        severity: isCritical ? 'CRITICAL' : 'HIGH',
        key: `BUDGET_EXCEEDED:${subject}`,
        evidence: usage,
      },
    ];
  }
  if (usage.status === 'NEAR_LIMIT') {
    return [
      {
        type: 'BUDGET_NEAR_LIMIT',
        severity: 'MEDIUM',
        key: `BUDGET_NEAR_LIMIT:${subject}`,
        evidence: usage,
      },
    ];
  }
  return [];
}

function spendingIncreaseInsights(
  trends: SpendingTrends,
  policy: FinancePolicy['insights'],
): Insight[] {
  return trends.byCategory
    .filter(
      (trend) =>
        trend.changeBasisPoints !== null &&
        trend.changeBasisPoints >= policy.spendingIncreaseBasisPoints &&
        trend.differenceMinor >= policy.minimumSpendingIncreaseMinor,
    )
    .map((trend) => ({
      type: 'SPENDING_INCREASE' as const,
      severity:
        (trend.changeBasisPoints ?? 0) >= policy.sharpSpendingIncreaseBasisPoints
          ? ('MEDIUM' as const)
          : ('LOW' as const),
      key: `SPENDING_INCREASE:${trend.categoryId ?? 'uncategorised'}:${trends.currentPeriod.start}`,
      evidence: {
        ...trend,
        currency: trends.currency,
        currentPeriod: trends.currentPeriod,
        previousPeriod: trends.previousPeriod,
      },
    }));
}

function anomalyInsight(anomaly: Anomaly): Insight {
  const subject =
    anomaly.type === 'UNUSUALLY_LARGE_TRANSACTION'
      ? anomaly.transactionId
      : `${anomaly.categoryId}:${anomaly.period.start}`;
  return {
    type: 'UNUSUAL_SPENDING',
    severity: 'MEDIUM',
    key: `UNUSUAL_SPENDING:${anomaly.type}:${subject}`,
    evidence: anomaly,
  };
}

function recurringExpenseInsight(pattern: RecurringExpensePattern): Insight {
  return {
    type: 'RECURRING_EXPENSE',
    severity: 'INFO',
    key: `RECURRING_EXPENSE:${pattern.merchantKey}:${pattern.frequency}`,
    evidence: pattern,
  };
}

function goalInsights(progress: GoalProgress): Insight[] {
  if (progress.state === 'IN_PROGRESS') {
    return [];
  }
  return [
    {
      type: 'GOAL_PROGRESS',
      severity: progress.state === 'OVERDUE' ? 'MEDIUM' : 'INFO',
      key: `GOAL_PROGRESS:${progress.goalId}:${progress.state}`,
      evidence: progress,
    },
  ];
}

function cashFlowInsights(outlook: CashFlowOutlook): Insight[] {
  if (outlook.expectedIncomeMinor <= 0 || outlook.projectedNetMinor >= 0) {
    return [];
  }
  return [
    {
      type: 'CASH_FLOW_WARNING',
      severity: 'HIGH',
      key: `CASH_FLOW_WARNING:${outlook.currency}:${outlook.period.start}`,
      evidence: outlook,
    },
  ];
}
