import type { BudgetUsage } from '../budget/budget-usage.js';
import { summarizeFlow } from '../flow/flow-breakdown.js';
import { CATEGORIES, expense, income } from '../ledger/ledger-entry.fixture.js';
import { CategoryTree } from '../categories/category-tree.js';
import { calendarMonth } from '../period/period.js';
import { budgetPace } from './budget-pace.js';
import { composeByTopLevelCategory } from './category-composition.js';
import { compareMonths } from './month-comparison.js';
import { buildMonthlySeries } from './monthly-series.js';

const SEPTEMBER = calendarMonth(2026, 9);
const OCTOBER = calendarMonth(2026, 10);

describe('buildMonthlySeries', () => {
  it('gives each month its totals and bars scaled to the largest amount of the series', () => {
    const series = buildMonthlySeries(
      [
        income(300000, { date: '2026-09-01' }),
        expense(150000, { date: '2026-09-10' }),
        expense(75000, { date: '2026-10-02' }),
      ],
      'EUR',
      [SEPTEMBER, OCTOBER],
    );

    expect(series).toEqual([
      {
        period: SEPTEMBER,
        incomeMinor: 300000,
        expensesMinor: 150000,
        netMinor: 150000,
        incomeBarBasisPoints: 10000,
        expensesBarBasisPoints: 5000,
      },
      {
        period: OCTOBER,
        incomeMinor: 0,
        expensesMinor: 75000,
        netMinor: -75000,
        incomeBarBasisPoints: 0,
        expensesBarBasisPoints: 2500,
      },
    ]);
  });

  it('draws empty bars when nothing was recorded', () => {
    expect(buildMonthlySeries([], 'EUR', [OCTOBER])[0]).toMatchObject({
      incomeBarBasisPoints: 0,
      expensesBarBasisPoints: 0,
    });
  });
});

describe('composeByTopLevelCategory', () => {
  it('shows top-level categories with their shares and where each slice starts', () => {
    const flow = summarizeFlow({
      entries: [
        expense(6000, { categoryId: 'groceries' }),
        expense(2000, { categoryId: 'restaurants' }),
        expense(2000, { categoryId: 'transport' }),
      ],
      type: 'EXPENSE',
      currency: 'EUR',
      categories: CATEGORIES,
    });

    expect(composeByTopLevelCategory(flow, CATEGORIES)).toEqual([
      {
        categoryId: 'food',
        isOther: false,
        totalMinor: 8000,
        shareBasisPoints: 8000,
        offsetBasisPoints: 0,
      },
      {
        categoryId: 'transport',
        isOther: false,
        totalMinor: 2000,
        shareBasisPoints: 2000,
        offsetBasisPoints: 8000,
      },
    ]);
  });

  it('groups what does not fit into one slice', () => {
    const tree = new CategoryTree(['a', 'b', 'c', 'd'].map((id) => ({ id, parentId: null })));
    const flow = summarizeFlow({
      entries: [
        expense(4000, { categoryId: 'a' }),
        expense(3000, { categoryId: 'b' }),
        expense(2000, { categoryId: 'c' }),
        expense(1000, { categoryId: 'd' }),
      ],
      type: 'EXPENSE',
      currency: 'EUR',
      categories: tree,
    });

    expect(composeByTopLevelCategory(flow, tree, 3)).toEqual([
      expect.objectContaining({ categoryId: 'a', offsetBasisPoints: 0 }),
      expect.objectContaining({ categoryId: 'b', offsetBasisPoints: 4000 }),
      expect.objectContaining({
        categoryId: null,
        isOther: true,
        totalMinor: 3000,
        shareBasisPoints: 3000,
        offsetBasisPoints: 7000,
      }),
    ]);
  });
});

describe('compareMonths', () => {
  it('compares totals and each top-level category between two months', () => {
    const comparison = compareMonths({
      entries: [
        income(300000, { date: '2026-09-01' }),
        income(300000, { date: '2026-10-01' }),
        expense(10000, { categoryId: 'groceries', date: '2026-09-03' }),
        expense(15000, { categoryId: 'groceries', date: '2026-10-03' }),
        expense(5000, { categoryId: 'transport', date: '2026-09-04' }),
      ],
      currency: 'EUR',
      first: SEPTEMBER,
      second: OCTOBER,
      categories: CATEGORIES,
    });

    expect(comparison.expenses).toMatchObject({
      currentMinor: 15000,
      previousMinor: 15000,
      direction: 'UNCHANGED',
    });
    expect(comparison.categories).toEqual([
      {
        categoryId: 'food',
        firstMinor: 10000,
        secondMinor: 15000,
        comparison: expect.objectContaining({
          differenceMinor: 5000,
          changeBasisPoints: 5000,
        }) as unknown,
        firstBarBasisPoints: 6667,
        secondBarBasisPoints: 10000,
      },
      {
        categoryId: 'transport',
        firstMinor: 5000,
        secondMinor: 0,
        comparison: expect.objectContaining({ direction: 'DECREASE' }) as unknown,
        firstBarBasisPoints: 3333,
        secondBarBasisPoints: 0,
      },
    ]);
  });
});

describe('budgetPace', () => {
  function usage(usageBasisPoints: number, spentMinor = 1000): BudgetUsage {
    const partial: Omit<BudgetUsage, 'forecast'> = {
      budgetId: 'budget',
      categoryId: null,
      period: OCTOBER,
      currency: 'EUR',
      limitMinor: 10000,
      spentMinor,
      remainingMinor: 0,
      usageBasisPoints,
      alertThresholdPercent: 80,
      status: 'ON_TRACK',
      byMember: [],
    };
    return { ...partial, forecast: {} as BudgetUsage['forecast'] };
  }

  it.each([
    [5000, 'ON_PACE'],
    [7000, 'FASTER'],
    [3000, 'SLOWER'],
  ] as const)('reads %d basis points used halfway through the month as %s', (used, pace) => {
    expect(budgetPace(usage(used), '2026-10-15')).toMatchObject({
      elapsedBasisPoints: 4839,
      pace,
    });
  });

  it('has no pace before anything is spent', () => {
    expect(budgetPace(usage(0, 0), '2026-10-15').pace).toBe('NOT_STARTED');
  });
});
