import { CATEGORIES, expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { calendarMonth } from '../period/period.js';
import { analyzeSpendingTrends, compareAmounts } from './spending-trends.js';

const OCTOBER = calendarMonth(2026, 10);
const SEPTEMBER = calendarMonth(2026, 9);

function trends(entries: readonly LedgerEntry[]): ReturnType<typeof analyzeSpendingTrends> {
  return analyzeSpendingTrends({
    currency: 'EUR',
    currentPeriod: OCTOBER,
    previousPeriod: SEPTEMBER,
    entries,
    categories: CATEGORIES,
  });
}

describe('compareAmounts', () => {
  it('reports an increase', () => {
    expect(compareAmounts(34000, 25500)).toEqual({
      currentMinor: 34000,
      previousMinor: 25500,
      differenceMinor: 8500,
      changeBasisPoints: 3333,
      direction: 'INCREASE',
    });
  });

  it('reports a decrease', () => {
    expect(compareAmounts(15000, 20000)).toMatchObject({
      differenceMinor: -5000,
      changeBasisPoints: -2500,
      direction: 'DECREASE',
    });
  });

  it('reports no change', () => {
    expect(compareAmounts(20000, 20000)).toMatchObject({
      differenceMinor: 0,
      changeBasisPoints: 0,
      direction: 'UNCHANGED',
    });
  });

  it('has no percentage change when the previous period was zero', () => {
    expect(compareAmounts(12000, 0)).toMatchObject({
      differenceMinor: 12000,
      changeBasisPoints: null,
      direction: 'INCREASE',
    });
  });

  it('reports no change and no percentage when both periods were zero', () => {
    expect(compareAmounts(0, 0)).toMatchObject({
      differenceMinor: 0,
      changeBasisPoints: null,
      direction: 'UNCHANGED',
    });
  });

  it('reports a complete drop to zero', () => {
    expect(compareAmounts(0, 8000)).toMatchObject({
      changeBasisPoints: -10000,
      direction: 'DECREASE',
    });
  });
});

describe('analyzeSpendingTrends', () => {
  const entries = [
    expense(34000, { categoryId: 'restaurants', date: '2026-10-12', memberId: 'member-a' }),
    expense(25500, { categoryId: 'restaurants', date: '2026-09-12', memberId: 'member-a' }),
    expense(20000, { categoryId: 'groceries', date: '2026-10-03', memberId: 'member-b' }),
    expense(30000, { categoryId: 'groceries', date: '2026-09-03', memberId: 'member-b' }),
    expense(4000, { categoryId: 'transport', date: '2026-10-20', memberId: 'member-b' }),
    income(450000, { date: '2026-10-01' }),
    transfer(50000, { date: '2026-10-02' }),
    expense(99999, { categoryId: 'restaurants', date: '2026-08-31' }),
  ];

  it('compares total spending between the two periods', () => {
    expect(trends(entries).total).toMatchObject({
      currentMinor: 58000,
      previousMinor: 55500,
      differenceMinor: 2500,
      changeBasisPoints: 450,
    });
  });

  it('compares each category, including ones present in only one period', () => {
    const byCategory = new Map(
      trends(entries).byCategory.map((trend) => [trend.categoryId, trend]),
    );

    expect(byCategory.get('restaurants')).toMatchObject({
      differenceMinor: 8500,
      changeBasisPoints: 3333,
      direction: 'INCREASE',
    });
    expect(byCategory.get('groceries')).toMatchObject({
      differenceMinor: -10000,
      changeBasisPoints: -3333,
      direction: 'DECREASE',
    });
    expect(byCategory.get('transport')).toMatchObject({
      previousMinor: 0,
      changeBasisPoints: null,
      direction: 'INCREASE',
    });
    expect(byCategory.get('food')).toMatchObject({ currentMinor: 54000, previousMinor: 55500 });
  });

  it('compares each member', () => {
    const byMember = new Map(trends(entries).byMember.map((trend) => [trend.memberId, trend]));

    expect(byMember.get('member-a')).toMatchObject({ currentMinor: 34000, previousMinor: 25500 });
    expect(byMember.get('member-b')).toMatchObject({ currentMinor: 24000, previousMinor: 30000 });
  });

  it('ranks the largest movements first', () => {
    expect(trends(entries).byCategory[0]?.categoryId).toBe('groceries');
  });
});
