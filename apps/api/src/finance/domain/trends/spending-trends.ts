import { ratioInBasisPoints, sumMinor } from '../../../money/money-math.js';
import type { CategoryTree } from '../categories/category-tree.js';
import { summarizeFlow } from '../flow/flow-breakdown.js';
import { within, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { DateRange } from '../period/period.js';

export type TrendDirection = 'INCREASE' | 'DECREASE' | 'UNCHANGED';

export interface AmountComparison {
  readonly currentMinor: number;
  readonly previousMinor: number;
  readonly differenceMinor: number;
  readonly changeBasisPoints: number | null;
  readonly direction: TrendDirection;
}

export interface CategoryTrend extends AmountComparison {
  readonly categoryId: string | null;
}

export interface MemberTrend extends AmountComparison {
  readonly memberId: string;
}

export interface SpendingTrends {
  readonly currency: string;
  readonly currentPeriod: DateRange;
  readonly previousPeriod: DateRange;
  readonly total: AmountComparison;
  readonly byCategory: readonly CategoryTrend[];
  readonly byMember: readonly MemberTrend[];
}

export interface SpendingTrendsInput {
  readonly currency: string;
  readonly currentPeriod: DateRange;
  readonly previousPeriod: DateRange;
  readonly entries: readonly LedgerEntry[];
  readonly categories: CategoryTree;
  readonly memberIds?: readonly string[];
}

export function compareAmounts(currentMinor: number, previousMinor: number): AmountComparison {
  const differenceMinor = sumMinor([currentMinor, -previousMinor]);
  return {
    currentMinor,
    previousMinor,
    differenceMinor,
    changeBasisPoints: ratioInBasisPoints(differenceMinor, previousMinor),
    direction: directionOf(differenceMinor),
  };
}

export function analyzeSpendingTrends(input: SpendingTrendsInput): SpendingTrends {
  const summarize = (period: DateRange): ReturnType<typeof summarizeFlow> =>
    summarizeFlow({
      entries: within(input.entries, period),
      type: 'EXPENSE',
      currency: input.currency,
      categories: input.categories,
      memberIds: input.memberIds ?? [],
    });
  const current = summarize(input.currentPeriod);
  const previous = summarize(input.previousPeriod);
  return {
    currency: input.currency,
    currentPeriod: input.currentPeriod,
    previousPeriod: input.previousPeriod,
    total: compareAmounts(current.totalMinor, previous.totalMinor),
    byCategory: compareByKey(
      current.byCategory.map((row) => [row.categoryId, row.totalMinor]),
      previous.byCategory.map((row) => [row.categoryId, row.totalMinor]),
    ).map(([categoryId, comparison]) => ({ categoryId, ...comparison })),
    byMember: compareByKey(
      current.byMember.map((row) => [row.memberId, row.totalMinor]),
      previous.byMember.map((row) => [row.memberId, row.totalMinor]),
    ).map(([memberId, comparison]) => ({ memberId, ...comparison })),
  };
}

function compareByKey<Key>(
  current: readonly (readonly [Key, number])[],
  previous: readonly (readonly [Key, number])[],
): [Key, AmountComparison][] {
  const currentTotals = new Map(current);
  const previousTotals = new Map(previous);
  const keys = new Set([...currentTotals.keys(), ...previousTotals.keys()]);
  return [...keys]
    .map((key): [Key, AmountComparison] => [
      key,
      compareAmounts(currentTotals.get(key) ?? 0, previousTotals.get(key) ?? 0),
    ])
    .sort(
      ([, left], [, right]) =>
        Math.abs(right.differenceMinor) - Math.abs(left.differenceMinor) ||
        right.currentMinor - left.currentMinor,
    );
}

function directionOf(differenceMinor: number): TrendDirection {
  if (differenceMinor === 0) {
    return 'UNCHANGED';
  }
  return differenceMinor > 0 ? 'INCREASE' : 'DECREASE';
}
