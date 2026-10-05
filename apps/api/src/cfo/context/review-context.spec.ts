import { calculateGoalProgress } from '../../finance/domain/goals/goal-progress.js';
import { expense } from '../../finance/domain/ledger/ledger-entry.fixture.js';
import {
  REVIEW_POLICY,
  TYPICAL_MONTH,
  restaurantBudget,
  snapshotOf,
} from '../analysis/financial-snapshot.fixture.js';
import { buildMonthlyReview } from '../analysis/monthly-review.js';
import type { NameDirectory } from './result-description.js';
import { toReviewContext } from './review-context.js';

const DIRECTORY: NameDirectory = {
  members: new Map([
    ['member-a', 'Member A'],
    ['member-b', 'Member B'],
    ['member-c', 'Member C'],
  ]),
  categories: new Map([
    ['food', 'Food'],
    ['groceries', 'Groceries'],
    ['restaurants', 'Restaurants'],
    ['transport', 'Transport'],
  ]),
  accounts: new Map(),
  goals: new Map([['goal-trip', 'Summer Trip']]),
};

const INTERNAL_IDENTIFIER =
  /member-[abc]|budget-restaurants|goal-trip|"(food|groceries|restaurants|transport)"|Id"|Minor"|BasisPoints"/;

describe('toReviewContext', () => {
  const entries = [
    ...TYPICAL_MONTH,
    expense(15000, { date: '2026-10-14', categoryId: 'restaurants', memberId: 'member-a' }),
  ];
  const review = buildMonthlyReview(
    snapshotOf({
      entries,
      overrides: {
        budgets: [restaurantBudget(entries)],
        goals: [
          calculateGoalProgress(
            {
              id: 'goal-trip',
              currency: 'EUR',
              targetAmountMinor: 100000,
              currentAmountMinor: 62000,
              targetDate: '2026-09-30',
            },
            '2026-10-31',
          ),
        ],
      },
    }),
    REVIEW_POLICY,
  );
  const context = toReviewContext(review, DIRECTORY);

  it('presents totals as formatted amounts and percentages', () => {
    expect(context).toMatchObject({
      currency: 'EUR',
      month: { start: '2026-10-01', end: '2026-10-31' },
      monthIsComplete: true,
      totals: {
        income: '€4,500.00',
        expenses: '€630.00',
        netCashFlow: '€3,870.00',
        savingsRate: '86%',
      },
    });
  });

  it('names categories, members and goals instead of identifying them', () => {
    expect(context).toMatchObject({
      topCategories: [
        { category: 'Food', total: '€570.00' },
        { category: 'Transport', total: '€60.00' },
      ],
      spendingByMember: [
        { member: 'Member A', spent: '€390.00' },
        { member: 'Member B', spent: '€180.00' },
        { member: 'Member C', spent: '€60.00' },
      ],
      goals: [
        {
          goal: 'Summer Trip',
          saved: '€620.00',
          remaining: '€380.00',
          progress: '62%',
          state: 'OVERDUE',
        },
      ],
      budgets: [
        {
          category: 'Restaurants',
          limit: '€300.00',
          spent: '€330.00',
          usage: '110%',
          status: 'EXCEEDED',
        },
      ],
    });
  });

  it('contains no internal identifier and no raw minor-unit or basis-point field', () => {
    expect(JSON.stringify(context)).not.toMatch(INTERNAL_IDENTIFIER);
  });

  it('carries the findings with their figures', () => {
    expect(context.findings).toEqual(
      expect.arrayContaining([
        {
          kind: 'STRENGTH',
          code: 'POSITIVE_CASH_FLOW',
          currency: 'EUR',
          income: '€4,500.00',
          expenses: '€630.00',
          net: '€3,870.00',
        },
        expect.objectContaining({
          kind: 'CONCERN',
          code: 'BUDGET_EXCEEDED',
          category: 'Restaurants',
          spent: '€330.00',
        }),
        expect.objectContaining({
          kind: 'CONCERN',
          code: 'GOAL_OVERDUE',
          goal: 'Summer Trip',
          remaining: '€380.00',
        }),
      ]),
    );
  });

  it('says plainly when there is nothing to compare with', () => {
    const alone = buildMonthlyReview(
      snapshotOf({ entries: TYPICAL_MONTH.filter((entry) => entry.date >= '2026-10-01') }),
      REVIEW_POLICY,
    );

    expect(toReviewContext(alone, DIRECTORY)).toMatchObject({
      comparisonAvailable: false,
      comparedWithPreviousPeriod: null,
    });
  });

  it('leaves out the member breakdown for a household of one', () => {
    const solo = buildMonthlyReview(
      snapshotOf({ entries: [expense(1000, { date: '2026-10-05' })], memberIds: ['member-a'] }),
      REVIEW_POLICY,
    );

    expect(toReviewContext(solo, DIRECTORY).spendingByMember).toEqual([]);
  });

  it('labels a budget without a category as covering all spending', () => {
    const usage = { ...restaurantBudget(entries, 50000), categoryId: null };
    const overall = buildMonthlyReview(
      snapshotOf({ entries, overrides: { budgets: [usage] } }),
      REVIEW_POLICY,
    );
    const described = toReviewContext(overall, DIRECTORY);

    expect(described.budgets).toEqual([expect.objectContaining({ category: 'All spending' })]);
    expect(JSON.stringify(described.findings)).not.toContain('Uncategorised');
  });

  it('is compact', () => {
    expect(JSON.stringify(context).length).toBeLessThan(4000);
  });
});
