import { calculateGoalProgress } from '../../finance/domain/goals/goal-progress.js';
import { evaluateInsights } from '../../finance/domain/insights/insight-engine.js';
import { expense, income } from '../../finance/domain/ledger/ledger-entry.fixture.js';
import { DEFAULT_FINANCE_POLICY } from '../../finance/domain/finance-policy.js';
import { detectRecurringExpenses } from '../../finance/domain/recurring/recurring-expense-detector.js';
import {
  OCTOBER,
  REVIEW_POLICY,
  TYPICAL_MONTH,
  restaurantBudget,
  snapshotOf,
} from './financial-snapshot.fixture.js';
import { buildMonthlyReview, type FindingCode } from './monthly-review.js';

function codesOf(review: ReturnType<typeof buildMonthlyReview>): FindingCode[] {
  return review.findings.map((finding) => finding.code);
}

describe('buildMonthlyReview', () => {
  describe('a typical month', () => {
    const review = buildMonthlyReview(snapshotOf({ entries: TYPICAL_MONTH }), REVIEW_POLICY);

    it('reports the totals the finance engine calculated', () => {
      expect(review).toMatchObject({
        currency: 'EUR',
        month: OCTOBER,
        asOf: '2026-10-31',
        isComplete: true,
        transactionCount: 5,
        totals: {
          incomeMinor: 450000,
          expensesMinor: 48000,
          netMinor: 402000,
          savingsRateBasisPoints: 8933,
        },
      });
    });

    it('compares with the previous period', () => {
      expect(review.comparison).toMatchObject({
        previousPeriod: { start: '2026-09-01', end: '2026-09-30' },
        expenses: {
          currentMinor: 48000,
          previousMinor: 29000,
          differenceMinor: 19000,
          changeBasisPoints: 6552,
        },
        income: { currentMinor: 450000, previousMinor: 300000, changeBasisPoints: 5000 },
        net: { currentMinor: 402000, previousMinor: 271000 },
        previousSavingsRateBasisPoints: 9033,
      });
    });

    it('lists top-level categories only, largest first', () => {
      expect(review.topCategories).toEqual([
        { categoryId: 'food', totalMinor: 42000, shareBasisPoints: 8750 },
        { categoryId: 'transport', totalMinor: 6000, shareBasisPoints: 1250 },
      ]);
    });

    it('attributes spending and income to every member', () => {
      expect(review.byMember).toEqual([
        {
          memberId: 'member-a',
          spentMinor: 24000,
          spendingShareBasisPoints: 5000,
          incomeMinor: 300000,
        },
        {
          memberId: 'member-b',
          spentMinor: 18000,
          spendingShareBasisPoints: 3750,
          incomeMinor: 150000,
        },
        { memberId: 'member-c', spentMinor: 6000, spendingShareBasisPoints: 1250, incomeMinor: 0 },
      ]);
    });

    it('lists the categories that changed most', () => {
      expect(
        review.categoryIncreases.map((trend) => [trend.categoryId, trend.differenceMinor]),
      ).toEqual([
        ['food', 13000],
        ['restaurants', 9000],
        ['transport', 6000],
      ]);
      expect(review.categoryDecreases).toEqual([]);
    });

    it('finds positive cash flow, a healthy savings rate and higher spending', () => {
      expect(codesOf(review)).toEqual([
        'POSITIVE_CASH_FLOW',
        'HEALTHY_SAVINGS_RATE',
        'SPENDING_INCREASED',
      ]);
    });
  });

  describe('an empty month', () => {
    const review = buildMonthlyReview(snapshotOf(), REVIEW_POLICY);

    it('has zero totals, no savings rate and no findings', () => {
      expect(review).toMatchObject({
        transactionCount: 0,
        totals: { incomeMinor: 0, expensesMinor: 0, netMinor: 0, savingsRateBasisPoints: null },
        topCategories: [],
        findings: [],
      });
    });

    it('produces no value that is not a finite number', () => {
      expect(JSON.stringify(review)).not.toMatch(/NaN|Infinity/);
    });
  });

  describe('history', () => {
    it('makes no comparison when the previous period has no transactions', () => {
      const withoutHistory = TYPICAL_MONTH.filter((entry) => entry.date >= OCTOBER.start);
      const review = buildMonthlyReview(snapshotOf({ entries: withoutHistory }), REVIEW_POLICY);

      expect(review.comparison).toBeNull();
      expect(review.categoryIncreases).toEqual([]);
      expect(review.categoryDecreases).toEqual([]);
      expect(codesOf(review)).not.toContain('SPENDING_INCREASED');
    });

    it('compares month to date with the same days of the previous month', () => {
      const review = buildMonthlyReview(
        snapshotOf({ entries: TYPICAL_MONTH, asOf: '2026-10-10' }),
        REVIEW_POLICY,
      );

      expect(review.isComplete).toBe(false);
      expect(review.comparison?.previousPeriod).toEqual({ start: '2026-09-01', end: '2026-09-10' });
      expect(review.comparison?.expenses).toMatchObject({
        currentMinor: 24000,
        previousMinor: 20000,
      });
    });

    it('reports lower spending as a strength', () => {
      const entries = [
        income(300000, { date: '2026-10-01' }),
        expense(20000, { date: '2026-10-05', categoryId: 'groceries' }),
        expense(40000, { date: '2026-09-05', categoryId: 'groceries' }),
      ];
      const review = buildMonthlyReview(snapshotOf({ entries }), REVIEW_POLICY);

      expect(codesOf(review)).toContain('SPENDING_DECREASED');
      expect(review.categoryDecreases.map((trend) => trend.categoryId)).toEqual([
        'food',
        'groceries',
      ]);
      expect(
        review.findings.find((finding) => finding.code === 'SPENDING_DECREASED')?.facts,
      ).toMatchObject({
        differenceMinor: 20000,
        changeBasisPoints: 5000,
      });
    });

    it('ignores a change too small to matter', () => {
      const entries = [
        expense(10500, { date: '2026-10-05' }),
        expense(10000, { date: '2026-09-05' }),
      ];

      expect(codesOf(buildMonthlyReview(snapshotOf({ entries }), REVIEW_POLICY))).toEqual([
        'NEGATIVE_CASH_FLOW',
      ]);
    });
  });

  describe('cash flow and savings', () => {
    it('raises negative cash flow as a concern', () => {
      const entries = [
        income(100000, { date: '2026-10-01' }),
        expense(130000, { date: '2026-10-05' }),
      ];
      const review = buildMonthlyReview(snapshotOf({ entries }), REVIEW_POLICY);

      expect(review.totals).toMatchObject({ netMinor: -30000, savingsRateBasisPoints: -3000 });
      expect(codesOf(review)).toEqual(['NEGATIVE_CASH_FLOW']);
    });

    it.each([
      [80000, 'HEALTHY_SAVINGS_RATE'],
      [80001, undefined],
      [95000, undefined],
      [95001, 'LOW_SAVINGS_RATE'],
    ])('with 100000 income and %d spent classifies the savings rate as %s', (spent, code) => {
      const entries = [
        income(100000, { date: '2026-10-01' }),
        expense(spent, { date: '2026-10-05' }),
      ];
      const codes = codesOf(buildMonthlyReview(snapshotOf({ entries }), REVIEW_POLICY)).filter(
        (found) => found.endsWith('SAVINGS_RATE'),
      );

      expect(codes).toEqual(code === undefined ? [] : [code]);
    });

    it('has no savings rate finding without income', () => {
      const review = buildMonthlyReview(
        snapshotOf({ entries: [expense(5000, { date: '2026-10-05' })] }),
        REVIEW_POLICY,
      );

      expect(review.totals.savingsRateBasisPoints).toBeNull();
      expect(codesOf(review)).toEqual(['NEGATIVE_CASH_FLOW']);
    });
  });

  describe('budgets', () => {
    function withBudget(
      spentMinor: number,
      asOf = '2026-10-31',
    ): ReturnType<typeof buildMonthlyReview> {
      const entries = [expense(spentMinor, { date: '2026-10-10', categoryId: 'restaurants' })];
      const usage = restaurantBudget(entries);
      const budget =
        asOf === '2026-10-31'
          ? usage
          : { ...usage, forecast: { ...usage.forecast, projectedTotalMinor: spentMinor * 2 } };
      return buildMonthlyReview(
        snapshotOf({ entries, asOf, overrides: { budgets: [budget] } }),
        REVIEW_POLICY,
      );
    }

    it('reports each budget with its usage and status', () => {
      expect(withBudget(24600).budgets).toMatchObject([
        {
          budgetId: 'budget-restaurants',
          categoryId: 'restaurants',
          limitMinor: 30000,
          spentMinor: 24600,
          remainingMinor: 5400,
          usageBasisPoints: 8200,
          status: 'NEAR_LIMIT',
          projectedTotalMinor: 24600,
          isProjectedOverLimit: false,
        },
      ]);
    });

    it.each([
      [12000, 'BUDGETS_ON_TRACK'],
      [24600, 'BUDGET_NEAR_LIMIT'],
      [33000, 'BUDGET_EXCEEDED'],
    ])('with %d spent of 30000 finds %s', (spent, code) => {
      expect(codesOf(withBudget(spent))).toContain(code);
    });

    it('warns when a budget is projected to end over its limit', () => {
      const review = withBudget(20000, '2026-10-15');

      expect(review.budgets[0]).toMatchObject({
        projectedTotalMinor: 40000,
        isProjectedOverLimit: true,
      });
      expect(codesOf(review)).toContain('BUDGET_PROJECTED_OVER_LIMIT');
      expect(codesOf(review)).not.toContain('BUDGETS_ON_TRACK');
    });

    it('says nothing about budgets when there are none', () => {
      const codes = codesOf(
        buildMonthlyReview(snapshotOf({ entries: TYPICAL_MONTH }), REVIEW_POLICY),
      );

      expect(codes.filter((code) => code.startsWith('BUDGET'))).toEqual([]);
    });
  });

  describe('goals, recurring expenses, forecast and insights', () => {
    it('reports completed and overdue goals', () => {
      const goal = {
        id: 'goal',
        currency: 'EUR',
        targetAmountMinor: 100000,
        currentAmountMinor: 62000,
      };
      const review = buildMonthlyReview(
        snapshotOf({
          overrides: {
            goals: [
              calculateGoalProgress(
                { ...goal, id: 'done', currentAmountMinor: 100000, targetDate: null },
                '2026-10-31',
              ),
              calculateGoalProgress(
                { ...goal, id: 'late', targetDate: '2026-09-30' },
                '2026-10-31',
              ),
              calculateGoalProgress(
                { ...goal, id: 'going', targetDate: '2027-06-30' },
                '2026-10-31',
              ),
            ],
          },
        }),
        REVIEW_POLICY,
      );

      expect(review.goals).toHaveLength(3);
      expect(review.findings.map((finding) => [finding.code, finding.facts.goalId])).toEqual([
        ['GOAL_COMPLETED', 'done'],
        ['GOAL_OVERDUE', 'late'],
      ]);
    });

    it('summarises recurring expenses as a monthly equivalent', () => {
      const charges = ['2026-08-03', '2026-09-03', '2026-10-03'].map((date) =>
        expense(1799, { merchant: 'Streaming', date }),
      );
      const recurringExpenses = detectRecurringExpenses({
        entries: charges,
        currency: 'EUR',
        asOf: '2026-10-31',
        policy: DEFAULT_FINANCE_POLICY.recurring,
      });
      const review = buildMonthlyReview(
        snapshotOf({ overrides: { recurringExpenses } }),
        REVIEW_POLICY,
      );

      expect(review.recurring).toMatchObject({
        monthlyEquivalentMinor: 1799,
        commitments: [
          { merchant: 'Streaming', frequency: 'MONTHLY', monthlyEquivalentMinor: 1799 },
        ],
      });
    });

    it('has no forecast for a month that is over', () => {
      expect(
        buildMonthlyReview(snapshotOf({ entries: TYPICAL_MONTH }), REVIEW_POLICY).forecast,
      ).toBeNull();
    });

    it('turns engine insights into concerns without recalculating them', () => {
      const anomaly = {
        type: 'UNUSUALLY_LARGE_TRANSACTION' as const,
        transactionId: 'transaction-1',
        categoryId: 'restaurants',
        memberId: 'member-a',
        merchant: 'Tasting Menu',
        date: '2026-10-14',
        currency: 'EUR',
        amountMinor: 24000,
        baselineAmountMinor: 3200,
        differenceMinor: 20800,
        ratioBasisPoints: 75000,
        sampleSize: 7,
      };
      const insights = evaluateInsights(
        {
          anomalies: [anomaly],
          cashFlowOutlook: {
            currency: 'EUR',
            period: OCTOBER,
            expectedIncomeMinor: 300000,
            projectedExpensesMinor: 328000,
            projectedNetMinor: -28000,
          },
        },
        DEFAULT_FINANCE_POLICY.insights,
      );
      const review = buildMonthlyReview(
        snapshotOf({ overrides: { insights, anomalies: [anomaly] } }),
        REVIEW_POLICY,
      );

      expect(review.findings).toEqual([
        {
          kind: 'CONCERN',
          code: 'PROJECTED_SHORTFALL',
          facts: {
            currency: 'EUR',
            expectedIncomeMinor: 300000,
            projectedExpensesMinor: 328000,
            shortfallMinor: 28000,
          },
        },
        {
          kind: 'CONCERN',
          code: 'UNUSUAL_SPENDING',
          facts: {
            currency: 'EUR',
            categoryId: 'restaurants',
            usualMinor: 3200,
            merchant: 'Tasting Menu',
            amountMinor: 24000,
            date: '2026-10-14',
          },
        },
      ]);
    });
  });

  it.each([1, 2, 3, 6])('covers a household of %d members', (memberCount) => {
    const memberIds = Array.from({ length: memberCount }, (_, index) => `member-${String(index)}`);
    const entries = memberIds.map((memberId) => expense(1000, { date: '2026-10-05', memberId }));
    const review = buildMonthlyReview(snapshotOf({ entries, memberIds }), REVIEW_POLICY);

    expect(review.byMember).toHaveLength(memberCount);
    expect(review.totals.expensesMinor).toBe(1000 * memberCount);
  });
});
