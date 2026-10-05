import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { Finding, MonthlyReview } from '../analysis/monthly-review.js';
import { describeResult, type NameDirectory } from './result-description.js';

export const ALL_SPENDING_LABEL = 'All spending';

const BUDGET_FINDINGS: readonly string[] = [
  'BUDGET_EXCEEDED',
  'BUDGET_NEAR_LIMIT',
  'BUDGET_PROJECTED_OVER_LIMIT',
];

export function toReviewContext(review: MonthlyReview, directory: NameDirectory): ReplyFacts {
  const { totals, comparison } = review;
  const raw = {
    currency: review.currency,
    month: review.month,
    dataThrough: review.asOf,
    monthIsComplete: review.isComplete,
    transactionsRecorded: review.transactionCount,
    totals: {
      incomeMinor: totals.incomeMinor,
      expensesMinor: totals.expensesMinor,
      netCashFlowMinor: totals.netMinor,
      savingsRateBasisPoints: totals.savingsRateBasisPoints,
    },
    comparisonAvailable: comparison !== null,
    comparedWithPreviousPeriod:
      comparison === null
        ? null
        : {
            previousPeriod: comparison.previousPeriod,
            expenses: comparison.expenses,
            income: comparison.income,
            netCashFlow: comparison.net,
            previousSavingsRateBasisPoints: comparison.previousSavingsRateBasisPoints,
          },
    topCategories: review.topCategories,
    spendingByMember: review.byMember.length > 1 ? review.byMember : [],
    categoryIncreases: review.categoryIncreases,
    categoryDecreases: review.categoryDecreases,
    budgets: review.budgets.map((budget) => withBudgetScope({ ...budget })),
    goals: review.goals.map((goal) => ({
      goalId: goal.goalId,
      targetMinor: goal.targetMinor,
      savedMinor: goal.currentMinor,
      remainingMinor: goal.remainingMinor,
      progressBasisPoints: goal.progressBasisPoints,
      state: goal.state,
      targetDate: goal.targetDate,
      requiredMonthlyMinor: goal.requiredMonthlyMinor,
    })),
    forecast: review.forecast,
    recurring: {
      monthlyEquivalentMinor: review.recurring.monthlyEquivalentMinor,
      commitments: review.recurring.commitments,
    },
    unusualSpending: review.anomalies.map(describeAnomaly),
    balances: review.balances,
    findings: review.findings.map(describeFinding),
  };
  return describeResult(raw, directory) as ReplyFacts;
}

function withBudgetScope(
  budget: Readonly<Record<string, unknown>> & { readonly categoryId: string | null },
): Record<string, unknown> {
  const { categoryId, ...rest } = budget;
  return categoryId === null ? { category: ALL_SPENDING_LABEL, ...rest } : { categoryId, ...rest };
}

function describeFinding(finding: Finding): Record<string, unknown> {
  const facts = BUDGET_FINDINGS.includes(finding.code)
    ? withBudgetScope({ categoryId: null, ...finding.facts })
    : finding.facts;
  return { kind: finding.kind, code: finding.code, ...facts };
}

function describeAnomaly(anomaly: Anomaly): Record<string, unknown> {
  const shared = { categoryId: anomaly.categoryId, usualMinor: anomaly.baselineAmountMinor };
  return anomaly.type === 'UNUSUALLY_LARGE_TRANSACTION'
    ? {
        ...shared,
        kind: 'LARGE_TRANSACTION',
        merchant: anomaly.merchant,
        date: anomaly.date,
        amountMinor: anomaly.amountMinor,
      }
    : { ...shared, kind: 'CATEGORY_TOTAL', amountMinor: anomaly.currentAmountMinor };
}
