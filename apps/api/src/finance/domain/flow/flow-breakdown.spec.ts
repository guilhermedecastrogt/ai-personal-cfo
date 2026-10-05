import { MixedCurrencyError } from '../../../money/money-math.js';
import { CATEGORIES, expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { summarizeFlow } from './flow-breakdown.js';

function spending(
  entries: readonly LedgerEntry[],
  memberIds: readonly string[] = [],
): ReturnType<typeof summarizeFlow> {
  return summarizeFlow({
    entries,
    type: 'EXPENSE',
    currency: 'EUR',
    categories: CATEGORIES,
    memberIds,
  });
}

function earnings(entries: readonly LedgerEntry[]): ReturnType<typeof summarizeFlow> {
  return summarizeFlow({ entries, type: 'INCOME', currency: 'EUR', categories: CATEGORIES });
}

describe('spending', () => {
  it('totals the expenses of the household', () => {
    const breakdown = spending([expense(24000), expense(18000), expense(9500)]);

    expect(breakdown.totalMinor).toBe(51500);
    expect(breakdown.transactionCount).toBe(3);
    expect(breakdown.currency).toBe('EUR');
  });

  it('is zero with empty breakdowns when there are no transactions', () => {
    expect(spending([])).toMatchObject({
      totalMinor: 0,
      transactionCount: 0,
      byMember: [],
      byCategory: [],
      byAccount: [],
    });
  });

  it('does not count transfers or income as spending', () => {
    const breakdown = spending([expense(2300), transfer(50000), income(85000)]);

    expect(breakdown.totalMinor).toBe(2300);
    expect(breakdown.transactionCount).toBe(1);
  });

  it('breaks spending down by member with shares that describe the whole', () => {
    const breakdown = spending([
      expense(42000, { memberId: 'member-a' }),
      expense(31000, { memberId: 'member-b' }),
      expense(8500, { memberId: 'member-c' }),
    ]);

    expect(breakdown.byMember).toEqual([
      { memberId: 'member-a', totalMinor: 42000, shareBasisPoints: 5153 },
      { memberId: 'member-b', totalMinor: 31000, shareBasisPoints: 3804 },
      { memberId: 'member-c', totalMinor: 8500, shareBasisPoints: 1043 },
    ]);
  });

  it.each([1, 2, 3, 8])('supports a household of %d members', (memberCount) => {
    const memberIds = Array.from({ length: memberCount }, (_, index) => `member-${String(index)}`);
    const breakdown = spending(
      memberIds.map((memberId) => expense(1000, { memberId })),
      memberIds,
    );

    expect(breakdown.byMember).toHaveLength(memberCount);
    expect(breakdown.totalMinor).toBe(1000 * memberCount);
    expect(breakdown.byMember.every((member) => member.totalMinor === 1000)).toBe(true);
  });

  it('lists members who spent nothing with a zero total', () => {
    const breakdown = spending(
      [expense(5000, { memberId: 'member-a' })],
      ['member-a', 'member-b', 'member-c'],
    );

    expect(breakdown.byMember).toEqual([
      { memberId: 'member-a', totalMinor: 5000, shareBasisPoints: 10000 },
      { memberId: 'member-b', totalMinor: 0, shareBasisPoints: 0 },
      { memberId: 'member-c', totalMinor: 0, shareBasisPoints: 0 },
    ]);
  });

  it('has no shares when nothing was spent', () => {
    const breakdown = spending([], ['member-a']);

    expect(breakdown.byMember).toEqual([
      { memberId: 'member-a', totalMinor: 0, shareBasisPoints: null },
    ]);
  });

  it('rolls subcategories up into their parent', () => {
    const breakdown = spending([
      expense(24000, { categoryId: 'groceries' }),
      expense(18000, { categoryId: 'restaurants' }),
      expense(1000, { categoryId: 'food' }),
      expense(7000, { categoryId: 'transport' }),
    ]);
    const totals = breakdown.byCategory.map((category) => [
      category.categoryId,
      category.totalMinor,
    ]);

    expect(totals).toEqual([
      ['food', 43000],
      ['groceries', 24000],
      ['restaurants', 18000],
      ['transport', 7000],
    ]);
  });

  it('reports uncategorised spending separately', () => {
    const breakdown = spending([expense(1500), expense(2500, { categoryId: 'transport' })]);

    expect(breakdown.byCategory).toEqual([
      expect.objectContaining({ categoryId: 'transport', totalMinor: 2500 }),
      expect.objectContaining({ categoryId: null, totalMinor: 1500 }),
    ]);
  });

  it('shows who spent what within a category', () => {
    const breakdown = spending([
      expense(18000, { categoryId: 'restaurants', memberId: 'member-a' }),
      expense(9000, { categoryId: 'restaurants', memberId: 'member-b' }),
      expense(3000, { categoryId: 'restaurants', memberId: 'member-c' }),
      expense(40000, { categoryId: 'groceries', memberId: 'member-b' }),
    ]);
    const restaurants = breakdown.byCategory.find(
      (category) => category.categoryId === 'restaurants',
    );

    expect(restaurants).toEqual({
      categoryId: 'restaurants',
      totalMinor: 30000,
      shareBasisPoints: 4286,
      byMember: [
        { memberId: 'member-a', totalMinor: 18000, shareBasisPoints: 6000 },
        { memberId: 'member-b', totalMinor: 9000, shareBasisPoints: 3000 },
        { memberId: 'member-c', totalMinor: 3000, shareBasisPoints: 1000 },
      ],
    });
  });

  it('breaks spending down by individual and joint accounts', () => {
    const breakdown = spending([
      expense(6000, { accountId: 'account-joint' }),
      expense(3000, { accountId: 'account-member-a' }),
      expense(1000, { accountId: 'account-joint' }),
    ]);

    expect(breakdown.byAccount).toEqual([
      { accountId: 'account-joint', totalMinor: 7000, shareBasisPoints: 7000 },
      { accountId: 'account-member-a', totalMinor: 3000, shareBasisPoints: 3000 },
    ]);
  });

  it('keeps cents exact across many small amounts', () => {
    const breakdown = spending(Array.from({ length: 1000 }, () => expense(10)));

    expect(breakdown.totalMinor).toBe(10000);
  });

  it('fails instead of adding amounts in different currencies', () => {
    expect(() => spending([expense(1000), expense(1000, { currency: 'BRL' })])).toThrow(
      MixedCurrencyError,
    );
  });

  it('fails even when the foreign-currency entry would not have been counted', () => {
    expect(() => spending([expense(1000), transfer(1000, { currency: 'BRL' })])).toThrow(
      MixedCurrencyError,
    );
  });
});

describe('income', () => {
  it('totals the income of the household', () => {
    expect(earnings([income(210000), income(240000)]).totalMinor).toBe(450000);
  });

  it('does not count transfers or expenses as income', () => {
    const breakdown = earnings([income(210000), transfer(50000), expense(2300)]);

    expect(breakdown.totalMinor).toBe(210000);
    expect(breakdown.transactionCount).toBe(1);
  });

  it('breaks income down by member', () => {
    const breakdown = earnings([
      income(210000, { memberId: 'member-a' }),
      income(240000, { memberId: 'member-b' }),
    ]);

    expect(breakdown.byMember).toEqual([
      { memberId: 'member-b', totalMinor: 240000, shareBasisPoints: 5333 },
      { memberId: 'member-a', totalMinor: 210000, shareBasisPoints: 4667 },
    ]);
  });

  it('breaks income down by category', () => {
    const breakdown = earnings([
      income(210000, { categoryId: 'salary' }),
      income(30000, { categoryId: null }),
    ]);

    expect(
      breakdown.byCategory.map(({ categoryId, totalMinor }) => [categoryId, totalMinor]),
    ).toEqual([
      ['salary', 210000],
      [null, 30000],
    ]);
  });
});
