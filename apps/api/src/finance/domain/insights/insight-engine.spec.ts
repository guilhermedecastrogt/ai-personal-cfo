import type { UnusuallyLargeTransaction } from '../anomaly/anomaly-detector.js';
import { calculateBudgetUsage, type BudgetUsage } from '../budget/budget-usage.js';
import { projectCashFlow } from '../cash-flow/cash-flow.js';
import { DEFAULT_FINANCE_POLICY } from '../finance-policy.js';
import { calculateGoalProgress } from '../goals/goal-progress.js';
import { CATEGORIES, expense } from '../ledger/ledger-entry.fixture.js';
import { calendarMonth } from '../period/period.js';
import { detectRecurringExpenses } from '../recurring/recurring-expense-detector.js';
import { analyzeSpendingTrends, type SpendingTrends } from '../trends/spending-trends.js';
import {
  evaluateInsights,
  isAtLeast,
  selectNotable,
  type InsightInputs,
} from './insight-engine.js';

const OCTOBER = calendarMonth(2026, 10);
const SEPTEMBER = calendarMonth(2026, 9);

function evaluate(inputs: InsightInputs): ReturnType<typeof evaluateInsights> {
  return evaluateInsights(inputs, DEFAULT_FINANCE_POLICY.insights);
}

function restaurantBudgetWith(spentMinor: number): BudgetUsage {
  return calculateBudgetUsage({
    budget: {
      id: 'budget-restaurants',
      categoryId: 'restaurants',
      limitMinor: 30000,
      currency: 'EUR',
      alertThresholdPercent: 80,
    },
    period: OCTOBER,
    asOf: '2026-10-20',
    entries:
      spentMinor === 0
        ? []
        : [expense(spentMinor, { categoryId: 'restaurants', date: '2026-10-10' })],
    history: [],
    categories: CATEGORIES,
  });
}

function transportTrend(currentMinor: number, previousMinor: number): SpendingTrends {
  return analyzeSpendingTrends({
    currency: 'EUR',
    currentPeriod: OCTOBER,
    previousPeriod: SEPTEMBER,
    entries: [
      expense(currentMinor, { categoryId: 'transport', date: '2026-10-10' }),
      expense(previousMinor, { categoryId: 'transport', date: '2026-09-10' }),
    ],
    categories: CATEGORIES,
  });
}

describe('evaluateInsights', () => {
  it('stays silent when nothing deserves attention', () => {
    expect(
      evaluate({
        budgets: [restaurantBudgetWith(0), restaurantBudgetWith(12000)],
        trends: transportTrend(10500, 10000),
        anomalies: [],
        recurringExpenses: [],
        goals: [
          calculateGoalProgress(
            {
              id: 'goal',
              currency: 'EUR',
              targetAmountMinor: 100000,
              currentAmountMinor: 62000,
              targetDate: '2027-06-30',
            },
            '2026-10-05',
          ),
        ],
        cashFlowOutlook: projectCashFlow('EUR', OCTOBER, 450000, 290000),
      }),
    ).toEqual([]);
  });

  it('stays silent with no inputs at all', () => {
    expect(evaluate({})).toEqual([]);
  });

  describe('budgets', () => {
    it('raises a medium insight when a budget is near its limit', () => {
      const usage = restaurantBudgetWith(24600);

      expect(evaluate({ budgets: [usage] })).toEqual([
        {
          type: 'BUDGET_NEAR_LIMIT',
          severity: 'MEDIUM',
          key: 'BUDGET_NEAR_LIMIT:budget-restaurants:2026-10-01',
          evidence: usage,
        },
      ]);
    });

    it('raises a high insight when a budget is exceeded', () => {
      const [insight] = evaluate({ budgets: [restaurantBudgetWith(33000)] });

      expect(insight).toMatchObject({
        type: 'BUDGET_EXCEEDED',
        severity: 'HIGH',
        key: 'BUDGET_EXCEEDED:budget-restaurants:2026-10-01',
      });
    });

    it('raises a critical insight when a budget is exceeded by half or more', () => {
      expect(evaluate({ budgets: [restaurantBudgetWith(45000)] })[0]?.severity).toBe('CRITICAL');
      expect(evaluate({ budgets: [restaurantBudgetWith(44999)] })[0]?.severity).toBe('HIGH');
    });
  });

  describe('spending increases', () => {
    it('raises a low insight for a category up by a quarter', () => {
      const [insight] = evaluate({ trends: transportTrend(13000, 10000) });

      expect(insight).toMatchObject({
        type: 'SPENDING_INCREASE',
        severity: 'LOW',
        key: 'SPENDING_INCREASE:transport:2026-10-01',
        evidence: {
          categoryId: 'transport',
          currency: 'EUR',
          currentMinor: 13000,
          previousMinor: 10000,
          differenceMinor: 3000,
          changeBasisPoints: 3000,
          currentPeriod: OCTOBER,
          previousPeriod: SEPTEMBER,
        },
      });
    });

    it('raises a medium insight for a category up by half', () => {
      expect(evaluate({ trends: transportTrend(15000, 10000) })[0]?.severity).toBe('MEDIUM');
    });

    it('ignores decreases and small relative increases', () => {
      expect(evaluate({ trends: transportTrend(8000, 10000) })).toEqual([]);
      expect(evaluate({ trends: transportTrend(12000, 10000) })).toEqual([]);
    });

    it('ignores a large relative increase on a small amount', () => {
      expect(evaluate({ trends: transportTrend(1500, 500) })).toEqual([]);
    });

    it('ignores a category with no spending in the previous period', () => {
      expect(evaluate({ trends: transportTrend(50000, 0) })).toEqual([]);
    });
  });

  it('raises a medium insight for each anomaly', () => {
    const anomaly: UnusuallyLargeTransaction = {
      type: 'UNUSUALLY_LARGE_TRANSACTION',
      transactionId: 'transaction-1',
      categoryId: 'restaurants',
      memberId: 'member-a',
      merchant: 'Bistro',
      date: '2026-10-03',
      currency: 'EUR',
      amountMinor: 14500,
      baselineAmountMinor: 3000,
      differenceMinor: 11500,
      ratioBasisPoints: 48333,
      sampleSize: 5,
    };

    expect(evaluate({ anomalies: [anomaly] })).toEqual([
      {
        type: 'UNUSUAL_SPENDING',
        severity: 'MEDIUM',
        key: 'UNUSUAL_SPENDING:UNUSUALLY_LARGE_TRANSACTION:transaction-1',
        evidence: anomaly,
      },
    ]);
  });

  it('raises an informational insight for a detected recurring expense', () => {
    const recurringExpenses = detectRecurringExpenses({
      entries: ['2026-08-03', '2026-09-03', '2026-10-03'].map((date) =>
        expense(1799, { merchant: 'Streaming', date }),
      ),
      currency: 'EUR',
      asOf: '2026-10-05',
      policy: DEFAULT_FINANCE_POLICY.recurring,
    });

    expect(evaluate({ recurringExpenses })[0]).toMatchObject({
      type: 'RECURRING_EXPENSE',
      severity: 'INFO',
      key: 'RECURRING_EXPENSE:streaming:MONTHLY',
    });
  });

  describe('goals', () => {
    const goal = {
      id: 'goal-trip',
      currency: 'EUR',
      targetAmountMinor: 100000,
      currentAmountMinor: 62000,
      targetDate: '2026-09-30',
    };

    it('raises a medium insight for an overdue goal', () => {
      const [insight] = evaluate({ goals: [calculateGoalProgress(goal, '2026-10-05')] });

      expect(insight).toMatchObject({
        type: 'GOAL_PROGRESS',
        severity: 'MEDIUM',
        key: 'GOAL_PROGRESS:goal-trip:OVERDUE',
      });
    });

    it('raises an informational insight for a completed goal', () => {
      const completed = calculateGoalProgress(
        { ...goal, currentAmountMinor: 100000 },
        '2026-10-05',
      );

      expect(evaluate({ goals: [completed] })[0]).toMatchObject({
        severity: 'INFO',
        key: 'GOAL_PROGRESS:goal-trip:COMPLETED',
      });
    });
  });

  describe('cash flow', () => {
    it('raises a high insight when projected spending exceeds expected income', () => {
      const outlook = projectCashFlow('EUR', OCTOBER, 450000, 478000);

      expect(evaluate({ cashFlowOutlook: outlook })).toEqual([
        {
          type: 'CASH_FLOW_WARNING',
          severity: 'HIGH',
          key: 'CASH_FLOW_WARNING:EUR:2026-10-01',
          evidence: outlook,
        },
      ]);
    });

    it('stays silent when there is no income to compare against', () => {
      expect(evaluate({ cashFlowOutlook: projectCashFlow('EUR', OCTOBER, 0, 50000) })).toEqual([]);
    });

    it('stays silent when projected spending equals expected income', () => {
      expect(
        evaluate({ cashFlowOutlook: projectCashFlow('EUR', OCTOBER, 300000, 300000) }),
      ).toEqual([]);
    });
  });

  it('orders insights from most to least severe', () => {
    const insights = evaluate({
      budgets: [restaurantBudgetWith(24600), restaurantBudgetWith(45000)],
      trends: transportTrend(13000, 10000),
      cashFlowOutlook: projectCashFlow('EUR', OCTOBER, 450000, 478000),
    });

    expect(insights.map((insight) => insight.severity)).toEqual([
      'CRITICAL',
      'HIGH',
      'MEDIUM',
      'LOW',
    ]);
  });

  it('gives a repeated finding the same key so it can be surfaced once', () => {
    const first = evaluate({ budgets: [restaurantBudgetWith(24600)] });
    const second = evaluate({ budgets: [restaurantBudgetWith(27000)] });

    expect(first[0]?.key).toBe(second[0]?.key);
  });
});

describe('severity', () => {
  it('orders severities from informational to critical', () => {
    expect(isAtLeast('HIGH', 'MEDIUM')).toBe(true);
    expect(isAtLeast('MEDIUM', 'MEDIUM')).toBe(true);
    expect(isAtLeast('LOW', 'MEDIUM')).toBe(false);
    expect(isAtLeast('CRITICAL', 'INFO')).toBe(true);
  });

  it('keeps only insights at or above the requested severity', () => {
    const insights = evaluate({
      budgets: [restaurantBudgetWith(24600)],
      trends: transportTrend(13000, 10000),
    });

    expect(selectNotable(insights, 'MEDIUM').map((insight) => insight.type)).toEqual([
      'BUDGET_NEAR_LIMIT',
    ]);
    expect(selectNotable(insights, 'INFO')).toHaveLength(2);
  });
});
