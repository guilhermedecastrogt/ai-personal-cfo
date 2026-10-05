import { CATEGORIES, expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { calendarMonth } from '../period/period.js';
import {
  InvalidBudgetError,
  calculateBudgetUsage,
  determineBudgetStatus,
  type BudgetDefinition,
} from './budget-usage.js';

const OCTOBER = calendarMonth(2026, 10);

const RESTAURANTS: BudgetDefinition = {
  id: 'budget-restaurants',
  categoryId: 'restaurants',
  limitMinor: 30000,
  currency: 'EUR',
  alertThresholdPercent: 80,
};

function usage(
  entries: readonly LedgerEntry[],
  budget: BudgetDefinition = RESTAURANTS,
  memberIds: readonly string[] = [],
): ReturnType<typeof calculateBudgetUsage> {
  return calculateBudgetUsage({
    budget,
    period: OCTOBER,
    asOf: '2026-10-20',
    entries,
    history: [],
    categories: CATEGORIES,
    memberIds,
  });
}

function dining(amountMinor: number, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return expense(amountMinor, { categoryId: 'restaurants', date: '2026-10-10', ...overrides });
}

describe('calculateBudgetUsage', () => {
  it('has not started when nothing was spent', () => {
    expect(usage([])).toMatchObject({
      limitMinor: 30000,
      spentMinor: 0,
      remainingMinor: 30000,
      usageBasisPoints: 0,
      status: 'NOT_STARTED',
    });
  });

  it('is on track with partial usage', () => {
    expect(usage([dining(12000)])).toMatchObject({
      spentMinor: 12000,
      remainingMinor: 18000,
      usageBasisPoints: 4000,
      status: 'ON_TRACK',
    });
  });

  it('is near the limit at 82 percent', () => {
    expect(usage([dining(16000), dining(8600)])).toMatchObject({
      spentMinor: 24600,
      remainingMinor: 5400,
      usageBasisPoints: 8200,
      status: 'NEAR_LIMIT',
    });
  });

  it('is near the limit exactly at the alert threshold', () => {
    expect(usage([dining(24000)]).status).toBe('NEAR_LIMIT');
    expect(usage([dining(23999)]).status).toBe('ON_TRACK');
  });

  it('is near the limit, not exceeded, exactly at the limit', () => {
    expect(usage([dining(30000)])).toMatchObject({
      remainingMinor: 0,
      usageBasisPoints: 10000,
      status: 'NEAR_LIMIT',
    });
  });

  it('is exceeded one minor unit over the limit', () => {
    expect(usage([dining(30001)])).toMatchObject({ remainingMinor: -1, status: 'EXCEEDED' });
  });

  it('reports how far over an exceeded budget is', () => {
    expect(usage([dining(42000)])).toMatchObject({
      spentMinor: 42000,
      remainingMinor: -12000,
      usageBasisPoints: 14000,
      status: 'EXCEEDED',
    });
  });

  it('attributes usage to each member of a household of any size', () => {
    const result = usage(
      [
        dining(18000, { memberId: 'member-a' }),
        dining(9000, { memberId: 'member-b' }),
        dining(3000, { memberId: 'member-c' }),
      ],
      RESTAURANTS,
      ['member-a', 'member-b', 'member-c', 'member-d'],
    );

    expect(result.byMember).toEqual([
      { memberId: 'member-a', totalMinor: 18000, shareBasisPoints: 6000 },
      { memberId: 'member-b', totalMinor: 9000, shareBasisPoints: 3000 },
      { memberId: 'member-c', totalMinor: 3000, shareBasisPoints: 1000 },
      { memberId: 'member-d', totalMinor: 0, shareBasisPoints: 0 },
    ]);
    expect(result.spentMinor).toBe(30000);
  });

  it('counts only expenses of its category and period', () => {
    const result = usage([
      dining(5000),
      expense(7000, { categoryId: 'groceries', date: '2026-10-10' }),
      dining(9000, { date: '2026-09-30' }),
      dining(9000, { date: '2026-11-01' }),
      income(100000, { date: '2026-10-10' }),
      transfer(50000, { date: '2026-10-10' }),
    ]);

    expect(result.spentMinor).toBe(5000);
  });

  it('includes subcategories in a budget for their parent', () => {
    const food = { ...RESTAURANTS, id: 'budget-food', categoryId: 'food', limitMinor: 100000 };
    const result = usage(
      [
        dining(5000),
        expense(7000, { categoryId: 'groceries', date: '2026-10-10' }),
        expense(1000, { categoryId: 'food', date: '2026-10-10' }),
        expense(4000, { categoryId: 'transport', date: '2026-10-10' }),
      ],
      food,
    );

    expect(result.spentMinor).toBe(13000);
  });

  it('covers all spending when the budget has no category', () => {
    const overall = { ...RESTAURANTS, id: 'budget-overall', categoryId: null, limitMinor: 250000 };
    const result = usage(
      [
        dining(5000),
        expense(7000, { date: '2026-10-10' }),
        transfer(50000, { date: '2026-10-10' }),
      ],
      overall,
    );

    expect(result.spentMinor).toBe(12000);
  });

  it('respects an alert threshold set on the budget', () => {
    const cautious = { ...RESTAURANTS, alertThresholdPercent: 50 };

    expect(usage([dining(15000)], cautious).status).toBe('NEAR_LIMIT');
    expect(usage([dining(15000)]).status).toBe('ON_TRACK');
  });

  it('projects the end of the period from the spending so far', () => {
    expect(usage([dining(20000)]).forecast).toMatchObject({
      method: 'LINEAR_PACE',
      spentMinor: 20000,
      projectedTotalMinor: 31000,
    });
  });

  it.each([0, -100, 10.5])('rejects a limit of %d', (limitMinor) => {
    expect(() => usage([], { ...RESTAURANTS, limitMinor })).toThrow(InvalidBudgetError);
  });

  it.each([0, 101, 79.5])('rejects an alert threshold of %d percent', (alertThresholdPercent) => {
    expect(() => usage([], { ...RESTAURANTS, alertThresholdPercent })).toThrow(InvalidBudgetError);
  });
});

describe('determineBudgetStatus', () => {
  it.each([
    [0, 'NOT_STARTED'],
    [1, 'ON_TRACK'],
    [7999, 'ON_TRACK'],
    [8000, 'NEAR_LIMIT'],
    [10000, 'NEAR_LIMIT'],
    [10001, 'EXCEEDED'],
  ])('with %d spent of 10000 is %s', (spentMinor, status) => {
    expect(determineBudgetStatus(spentMinor, 10000, 80)).toBe(status);
  });
});
