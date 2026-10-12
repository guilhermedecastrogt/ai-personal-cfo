import { ratioInBasisPoints } from '../../../money/money-math.js';
import { arrangeByHierarchy, type Arranged } from '../categories/category-hierarchy.js';
import type { CategoryTree } from '../categories/category-tree.js';
import {
  summarizeFlow,
  type CategoryAmount,
  type FlowBreakdown,
  type MemberAmount,
} from '../flow/flow-breakdown.js';
import { within, type FlowType, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { DateRange } from '../period/period.js';
import { compareAmounts, type AmountComparison } from '../trends/spending-trends.js';

export interface CategoryMonth {
  readonly period: DateRange;
  readonly totalMinor: number;
  readonly barBasisPoints: number;
}

export interface CategoryActivity {
  readonly currency: string;
  readonly totalMinor: number;
  readonly transactionCount: number;
  readonly shareBasisPoints: number | null;
  readonly comparison: AmountComparison;
  readonly previousPeriod: DateRange;
  readonly byMember: readonly MemberAmount[];
  readonly subcategories: readonly Arranged<CategoryAmount>[];
  readonly months: readonly CategoryMonth[];
}

export interface CategoryActivityInput {
  readonly entries: readonly LedgerEntry[];
  readonly currency: string;
  readonly categoryId: string;
  readonly type: FlowType;
  readonly period: DateRange;
  readonly previousPeriod: DateRange;
  readonly months: readonly DateRange[];
  readonly categories: CategoryTree;
}

export function describeCategoryActivity(input: CategoryActivityInput): CategoryActivity {
  const ofCurrency = input.entries.filter((entry) => entry.currency === input.currency);
  const inCategory = ofCurrency.filter((entry) =>
    input.categories.isWithin(entry.categoryId, input.categoryId),
  );
  const flowOf = (entries: readonly LedgerEntry[], period: DateRange): FlowBreakdown =>
    summarizeFlow({
      entries: within(entries, period),
      type: input.type,
      currency: input.currency,
      categories: input.categories,
    });
  const current = flowOf(inCategory, input.period);
  const whole = flowOf(ofCurrency, input.period);
  const totals = input.months.map((period) => ({
    period,
    totalMinor: flowOf(inCategory, period).totalMinor,
  }));
  const largest = Math.max(0, ...totals.map((month) => month.totalMinor));
  return {
    currency: input.currency,
    totalMinor: current.totalMinor,
    transactionCount: current.transactionCount,
    shareBasisPoints: ratioInBasisPoints(current.totalMinor, whole.totalMinor),
    comparison: compareAmounts(
      current.totalMinor,
      flowOf(inCategory, input.previousPeriod).totalMinor,
    ),
    previousPeriod: input.previousPeriod,
    byMember: current.byMember,
    subcategories: arrangeByHierarchy(current.byCategory, input.categories).filter(
      (row) =>
        row.categoryId !== input.categoryId &&
        input.categories.isWithin(row.categoryId, input.categoryId),
    ),
    months: totals.map((month) => ({
      ...month,
      barBasisPoints: ratioInBasisPoints(month.totalMinor, largest) ?? 0,
    })),
  };
}
