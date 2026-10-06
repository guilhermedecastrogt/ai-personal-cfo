import { ratioInBasisPoints } from '../../../money/money-math.js';
import { calculateCashFlow } from '../cash-flow/cash-flow.js';
import type { CategoryTree } from '../categories/category-tree.js';
import { summarizeFlow } from '../flow/flow-breakdown.js';
import { within, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { DateRange } from '../period/period.js';
import { compareAmounts, type AmountComparison } from '../trends/spending-trends.js';

export interface CategoryMonthComparison {
  readonly categoryId: string | null;
  readonly firstMinor: number;
  readonly secondMinor: number;
  readonly comparison: AmountComparison;
  readonly firstBarBasisPoints: number;
  readonly secondBarBasisPoints: number;
}

export interface MonthComparison {
  readonly currency: string;
  readonly first: DateRange;
  readonly second: DateRange;
  readonly income: AmountComparison;
  readonly expenses: AmountComparison;
  readonly net: AmountComparison;
  readonly categories: readonly CategoryMonthComparison[];
}

export interface MonthComparisonInput {
  readonly entries: readonly LedgerEntry[];
  readonly currency: string;
  readonly first: DateRange;
  readonly second: DateRange;
  readonly categories: CategoryTree;
}

export function compareMonths(input: MonthComparisonInput): MonthComparison {
  const { entries, currency, first, second, categories } = input;
  const firstEntries = within(entries, first);
  const secondEntries = within(entries, second);
  const firstFlow = calculateCashFlow(firstEntries, currency);
  const secondFlow = calculateCashFlow(secondEntries, currency);
  const totalsOf = (monthEntries: readonly LedgerEntry[]): Map<string | null, number> =>
    new Map(
      summarizeFlow({ entries: monthEntries, type: 'EXPENSE', currency, categories })
        .byCategory.filter((entry) => categories.isTopLevel(entry.categoryId))
        .map((entry) => [entry.categoryId, entry.totalMinor]),
    );
  const firstTotals = totalsOf(firstEntries);
  const secondTotals = totalsOf(secondEntries);
  const categoryIds = [...new Set([...secondTotals.keys(), ...firstTotals.keys()])];
  const largest = Math.max(0, ...firstTotals.values(), ...secondTotals.values());
  const rows = categoryIds.map((categoryId) => {
    const firstMinor = firstTotals.get(categoryId) ?? 0;
    const secondMinor = secondTotals.get(categoryId) ?? 0;
    return {
      categoryId,
      firstMinor,
      secondMinor,
      comparison: compareAmounts(secondMinor, firstMinor),
      firstBarBasisPoints: ratioInBasisPoints(firstMinor, largest) ?? 0,
      secondBarBasisPoints: ratioInBasisPoints(secondMinor, largest) ?? 0,
    };
  });
  return {
    currency,
    first,
    second,
    income: compareAmounts(secondFlow.incomeMinor, firstFlow.incomeMinor),
    expenses: compareAmounts(secondFlow.expensesMinor, firstFlow.expensesMinor),
    net: compareAmounts(secondFlow.netMinor, firstFlow.netMinor),
    categories: rows.sort(
      (left, right) =>
        Math.max(right.firstMinor, right.secondMinor) - Math.max(left.firstMinor, left.secondMinor),
    ),
  };
}
