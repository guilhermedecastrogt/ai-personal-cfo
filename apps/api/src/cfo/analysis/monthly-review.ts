import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { CurrencyBalances } from '../../finance/domain/balances/account-balances.js';
import type { BudgetStatus } from '../../finance/domain/budget/budget-usage.js';
import type { FinancePolicy } from '../../finance/domain/finance-policy.js';
import type { ForecastMethod } from '../../finance/domain/forecast/spending-forecast.js';
import type { GoalProgress } from '../../finance/domain/goals/goal-progress.js';
import type { DateRange, IsoDate } from '../../finance/domain/period/period.js';
import { isAtLeastRatio } from '../../money/money-math.js';
import {
  summarizeRecurringExpenses,
  type RecurringSummary,
} from '../../finance/domain/recurring/recurring-summary.js';
import {
  compareAmounts,
  type AmountComparison,
  type CategoryTrend,
} from '../../finance/domain/trends/spending-trends.js';
import type { FinancialSnapshot } from './financial-snapshot.js';

export type FindingKind = 'STRENGTH' | 'CONCERN';

export type FindingCode =
  | 'POSITIVE_CASH_FLOW'
  | 'HEALTHY_SAVINGS_RATE'
  | 'SPENDING_DECREASED'
  | 'BUDGETS_ON_TRACK'
  | 'GOAL_COMPLETED'
  | 'NEGATIVE_CASH_FLOW'
  | 'LOW_SAVINGS_RATE'
  | 'SPENDING_INCREASED'
  | 'CATEGORY_SPENDING_INCREASED'
  | 'BUDGET_EXCEEDED'
  | 'BUDGET_NEAR_LIMIT'
  | 'BUDGET_PROJECTED_OVER_LIMIT'
  | 'UNUSUAL_SPENDING'
  | 'GOAL_OVERDUE'
  | 'PROJECTED_SHORTFALL';

export interface Finding {
  readonly kind: FindingKind;
  readonly code: FindingCode;
  readonly facts: Readonly<Record<string, unknown>>;
}

export interface ReviewComparison {
  readonly previousPeriod: DateRange;
  readonly expenses: AmountComparison;
  readonly income: AmountComparison;
  readonly net: AmountComparison;
  readonly previousSavingsRateBasisPoints: number | null;
}

export interface ReviewBudget {
  readonly budgetId: string;
  readonly categoryId: string | null;
  readonly limitMinor: number;
  readonly spentMinor: number;
  readonly remainingMinor: number;
  readonly usageBasisPoints: number;
  readonly status: BudgetStatus;
  readonly projectedTotalMinor: number;
  readonly isProjectedOverLimit: boolean;
}

export interface MonthlyReview {
  readonly currency: string;
  readonly month: DateRange;
  readonly asOf: IsoDate;
  readonly isComplete: boolean;
  readonly transactionCount: number;
  readonly totals: {
    readonly incomeMinor: number;
    readonly expensesMinor: number;
    readonly netMinor: number;
    readonly savingsRateBasisPoints: number | null;
  };
  readonly comparison: ReviewComparison | null;
  readonly topCategories: readonly {
    readonly categoryId: string | null;
    readonly totalMinor: number;
    readonly shareBasisPoints: number | null;
  }[];
  readonly byMember: readonly {
    readonly memberId: string;
    readonly spentMinor: number;
    readonly spendingShareBasisPoints: number | null;
    readonly incomeMinor: number;
  }[];
  readonly categoryIncreases: readonly CategoryTrend[];
  readonly categoryDecreases: readonly CategoryTrend[];
  readonly budgets: readonly ReviewBudget[];
  readonly goals: readonly GoalProgress[];
  readonly forecast: {
    readonly spentMinor: number;
    readonly projectedTotalMinor: number;
    readonly daysRemaining: number;
    readonly method: ForecastMethod;
  } | null;
  readonly recurring: RecurringSummary;
  readonly anomalies: readonly Anomaly[];
  readonly balances: CurrencyBalances | null;
  readonly findings: readonly Finding[];
}

type ReviewPolicy = Pick<FinancePolicy, 'review' | 'insights'>;

export function buildMonthlyReview(
  snapshot: FinancialSnapshot,
  policy: ReviewPolicy,
): MonthlyReview {
  const { cashFlow, savings } = snapshot.cashFlow;
  const comparison = compareWithPrevious(snapshot);
  const budgets = snapshot.budgets.map(reviewBudget);
  const review = {
    currency: snapshot.currency,
    month: snapshot.month,
    asOf: snapshot.asOf,
    isComplete: snapshot.isComplete,
    transactionCount: snapshot.spending.transactionCount + snapshot.income.transactionCount,
    totals: {
      incomeMinor: cashFlow.incomeMinor,
      expensesMinor: cashFlow.expensesMinor,
      netMinor: cashFlow.netMinor,
      savingsRateBasisPoints: savings.savingsRateBasisPoints,
    },
    comparison,
    topCategories: topCategories(snapshot, policy),
    byMember: byMember(snapshot),
    categoryIncreases: categoryChanges(snapshot, comparison, policy, 'INCREASE'),
    categoryDecreases: categoryChanges(snapshot, comparison, policy, 'DECREASE'),
    budgets,
    goals: snapshot.goals,
    forecast:
      snapshot.forecast === null
        ? null
        : {
            spentMinor: snapshot.forecast.spentMinor,
            projectedTotalMinor: snapshot.forecast.projectedTotalMinor,
            daysRemaining: snapshot.forecast.daysRemaining,
            method: snapshot.forecast.method,
          },
    recurring: summarizeRecurringExpenses(snapshot.recurringExpenses, snapshot.currency),
    anomalies: snapshot.anomalies,
    balances: snapshot.balances,
  };
  return { ...review, findings: findingsOf(snapshot, review, policy) };
}

function compareWithPrevious(snapshot: FinancialSnapshot): ReviewComparison | null {
  const { previous } = snapshot;
  if (previous.transactionCount === 0) {
    return null;
  }
  const current = snapshot.cashFlow.cashFlow;
  const before = previous.cashFlow.cashFlow;
  return {
    previousPeriod: previous.period,
    expenses: compareAmounts(current.expensesMinor, before.expensesMinor),
    income: compareAmounts(current.incomeMinor, before.incomeMinor),
    net: compareAmounts(current.netMinor, before.netMinor),
    previousSavingsRateBasisPoints: previous.cashFlow.savings.savingsRateBasisPoints,
  };
}

function topCategories(
  snapshot: FinancialSnapshot,
  policy: ReviewPolicy,
): MonthlyReview['topCategories'] {
  const topLevel = new Set<string | null>([...snapshot.topLevelCategoryIds, null]);
  return snapshot.spending.byCategory
    .filter((category) => topLevel.has(category.categoryId))
    .slice(0, policy.review.topCategories)
    .map(({ categoryId, totalMinor, shareBasisPoints }) => ({
      categoryId,
      totalMinor,
      shareBasisPoints,
    }));
}

function byMember(snapshot: FinancialSnapshot): MonthlyReview['byMember'] {
  const income = new Map(snapshot.income.byMember.map((row) => [row.memberId, row.totalMinor]));
  return snapshot.spending.byMember.map((row) => ({
    memberId: row.memberId,
    spentMinor: row.totalMinor,
    spendingShareBasisPoints: row.shareBasisPoints,
    incomeMinor: income.get(row.memberId) ?? 0,
  }));
}

function categoryChanges(
  snapshot: FinancialSnapshot,
  comparison: ReviewComparison | null,
  policy: ReviewPolicy,
  direction: 'INCREASE' | 'DECREASE',
): CategoryTrend[] {
  if (comparison === null) {
    return [];
  }
  return snapshot.trends.byCategory
    .filter(
      (trend) =>
        trend.categoryId !== null &&
        trend.direction === direction &&
        Math.abs(trend.differenceMinor) >= policy.insights.minimumSpendingIncreaseMinor,
    )
    .slice(0, policy.review.categoryChanges);
}

function reviewBudget(usage: FinancialSnapshot['budgets'][number]): ReviewBudget {
  return {
    budgetId: usage.budgetId,
    categoryId: usage.categoryId,
    limitMinor: usage.limitMinor,
    spentMinor: usage.spentMinor,
    remainingMinor: usage.remainingMinor,
    usageBasisPoints: usage.usageBasisPoints,
    status: usage.status,
    projectedTotalMinor: usage.forecast.projectedTotalMinor,
    isProjectedOverLimit:
      usage.status !== 'EXCEEDED' && usage.forecast.projectedTotalMinor > usage.limitMinor,
  };
}

function findingsOf(
  snapshot: FinancialSnapshot,
  review: Omit<MonthlyReview, 'findings'>,
  policy: ReviewPolicy,
): Finding[] {
  return [
    ...cashFlowFindings(review, policy),
    ...spendingChangeFindings(review, policy),
    ...budgetFindings(review),
    ...insightFindings(snapshot),
    ...goalFindings(review),
  ];
}

function cashFlowFindings(
  review: Omit<MonthlyReview, 'findings'>,
  policy: ReviewPolicy,
): Finding[] {
  const { incomeMinor, expensesMinor, netMinor, savingsRateBasisPoints } = review.totals;
  const facts = { currency: review.currency, incomeMinor, expensesMinor, netMinor };
  const findings: Finding[] = [];
  if (netMinor > 0) {
    findings.push({ kind: 'STRENGTH', code: 'POSITIVE_CASH_FLOW', facts });
  } else if (netMinor < 0) {
    findings.push({ kind: 'CONCERN', code: 'NEGATIVE_CASH_FLOW', facts });
  }
  if (savingsRateBasisPoints === null) {
    return findings;
  }
  const rateFacts = { savingsRateBasisPoints };
  const reaches = (basisPoints: number): boolean =>
    isAtLeastRatio(netMinor, incomeMinor, basisPoints);
  if (reaches(policy.review.healthySavingsRateBasisPoints)) {
    findings.push({ kind: 'STRENGTH', code: 'HEALTHY_SAVINGS_RATE', facts: rateFacts });
  } else if (netMinor >= 0 && !reaches(policy.review.lowSavingsRateBasisPoints)) {
    findings.push({ kind: 'CONCERN', code: 'LOW_SAVINGS_RATE', facts: rateFacts });
  }
  return findings;
}

function spendingChangeFindings(
  review: Omit<MonthlyReview, 'findings'>,
  policy: ReviewPolicy,
): Finding[] {
  const change = review.comparison?.expenses;
  const basisPoints = change?.changeBasisPoints;
  if (change === undefined || basisPoints === null || basisPoints === undefined) {
    return [];
  }
  const isMaterial =
    Math.abs(basisPoints) >= policy.insights.spendingIncreaseBasisPoints &&
    Math.abs(change.differenceMinor) >= policy.insights.minimumSpendingIncreaseMinor;
  if (!isMaterial) {
    return [];
  }
  return [
    {
      kind: basisPoints > 0 ? 'CONCERN' : 'STRENGTH',
      code: basisPoints > 0 ? 'SPENDING_INCREASED' : 'SPENDING_DECREASED',
      facts: {
        currency: review.currency,
        currentMinor: change.currentMinor,
        previousMinor: change.previousMinor,
        differenceMinor: Math.abs(change.differenceMinor),
        changeBasisPoints: Math.abs(basisPoints),
      },
    },
  ];
}

function budgetFindings(review: Omit<MonthlyReview, 'findings'>): Finding[] {
  const facts = (budget: ReviewBudget): Finding['facts'] => ({
    currency: review.currency,
    categoryId: budget.categoryId,
    limitMinor: budget.limitMinor,
    spentMinor: budget.spentMinor,
    usageBasisPoints: budget.usageBasisPoints,
    projectedTotalMinor: budget.projectedTotalMinor,
  });
  const concerns = review.budgets.flatMap((budget): Finding[] => {
    if (budget.status === 'EXCEEDED') {
      return [{ kind: 'CONCERN', code: 'BUDGET_EXCEEDED', facts: facts(budget) }];
    }
    if (budget.isProjectedOverLimit) {
      return [{ kind: 'CONCERN', code: 'BUDGET_PROJECTED_OVER_LIMIT', facts: facts(budget) }];
    }
    return budget.status === 'NEAR_LIMIT'
      ? [{ kind: 'CONCERN', code: 'BUDGET_NEAR_LIMIT', facts: facts(budget) }]
      : [];
  });
  if (concerns.length > 0 || review.budgets.length === 0) {
    return concerns;
  }
  return [
    { kind: 'STRENGTH', code: 'BUDGETS_ON_TRACK', facts: { budgetCount: review.budgets.length } },
  ];
}

function insightFindings(snapshot: FinancialSnapshot): Finding[] {
  return snapshot.insights.flatMap((insight): Finding[] => {
    switch (insight.type) {
      case 'SPENDING_INCREASE':
        return [
          {
            kind: 'CONCERN',
            code: 'CATEGORY_SPENDING_INCREASED',
            facts: {
              currency: insight.evidence.currency,
              categoryId: insight.evidence.categoryId,
              currentMinor: insight.evidence.currentMinor,
              previousMinor: insight.evidence.previousMinor,
              differenceMinor: insight.evidence.differenceMinor,
              changeBasisPoints: insight.evidence.changeBasisPoints,
            },
          },
        ];
      case 'UNUSUAL_SPENDING':
        return [
          { kind: 'CONCERN', code: 'UNUSUAL_SPENDING', facts: unusualFacts(insight.evidence) },
        ];
      case 'CASH_FLOW_WARNING':
        return [
          {
            kind: 'CONCERN',
            code: 'PROJECTED_SHORTFALL',
            facts: {
              currency: insight.evidence.currency,
              expectedIncomeMinor: insight.evidence.expectedIncomeMinor,
              projectedExpensesMinor: insight.evidence.projectedExpensesMinor,
              shortfallMinor: -insight.evidence.projectedNetMinor,
            },
          },
        ];
      default:
        return [];
    }
  });
}

function unusualFacts(anomaly: Anomaly): Finding['facts'] {
  const shared = {
    currency: anomaly.currency,
    categoryId: anomaly.categoryId,
    usualMinor: anomaly.baselineAmountMinor,
  };
  return anomaly.type === 'UNUSUALLY_LARGE_TRANSACTION'
    ? {
        ...shared,
        merchant: anomaly.merchant,
        amountMinor: anomaly.amountMinor,
        date: anomaly.date,
      }
    : { ...shared, amountMinor: anomaly.currentAmountMinor };
}

function goalFindings(review: Omit<MonthlyReview, 'findings'>): Finding[] {
  return review.goals.flatMap((goal): Finding[] => {
    const facts = {
      currency: goal.currency,
      goalId: goal.goalId,
      targetMinor: goal.targetMinor,
      remainingMinor: goal.remainingMinor,
      progressBasisPoints: goal.progressBasisPoints,
    };
    if (goal.state === 'COMPLETED') {
      return [{ kind: 'STRENGTH', code: 'GOAL_COMPLETED', facts }];
    }
    return goal.state === 'OVERDUE' ? [{ kind: 'CONCERN', code: 'GOAL_OVERDUE', facts }] : [];
  });
}
