import {
  divideRounded,
  isAtLeastRatio,
  ratioInBasisPoints,
  sumMinor,
} from '../../../money/money-math.js';
import type { FinancePolicy } from '../finance-policy.js';
import type { PeriodEntries } from '../forecast/spending-forecast.js';
import { amountsOf, flowsOf, within, type LedgerEntry } from '../ledger/ledger-entry.js';
import { daysBetween, elapsedDays, type DateRange, type IsoDate } from '../period/period.js';
import { lowerMedian } from '../statistics.js';

export interface UnusuallyLargeTransaction {
  readonly type: 'UNUSUALLY_LARGE_TRANSACTION';
  readonly transactionId: string;
  readonly categoryId: string;
  readonly memberId: string;
  readonly merchant: string | null;
  readonly date: IsoDate;
  readonly currency: string;
  readonly amountMinor: number;
  readonly baselineAmountMinor: number;
  readonly differenceMinor: number;
  readonly ratioBasisPoints: number | null;
  readonly sampleSize: number;
}

export interface UnusualCategorySpending {
  readonly type: 'UNUSUAL_CATEGORY_SPENDING';
  readonly categoryId: string;
  readonly period: DateRange;
  readonly currency: string;
  readonly currentAmountMinor: number;
  readonly baselineAmountMinor: number;
  readonly differenceMinor: number;
  readonly ratioBasisPoints: number | null;
  readonly baselinePeriods: number;
}

export type Anomaly = UnusuallyLargeTransaction | UnusualCategorySpending;

export interface LargeTransactionInput {
  readonly currency: string;
  readonly candidates: readonly LedgerEntry[];
  readonly history: readonly LedgerEntry[];
  readonly policy: FinancePolicy['anomaly'];
}

export interface CategorySpendingInput {
  readonly currency: string;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly entries: readonly LedgerEntry[];
  readonly history: readonly PeriodEntries[];
  readonly policy: FinancePolicy['anomaly'];
}

export function detectUnusuallyLargeTransactions(
  input: LargeTransactionInput,
): UnusuallyLargeTransaction[] {
  const history = flowsOf(input.history, 'EXPENSE', input.currency);
  return flowsOf(input.candidates, 'EXPENSE', input.currency)
    .map((candidate) => assessTransaction(candidate, history, input))
    .filter((anomaly) => anomaly !== undefined);
}

export function detectUnusualCategorySpending(
  input: CategorySpendingInput,
): UnusualCategorySpending[] {
  const daysElapsed = elapsedDays(input.period, input.asOf);
  const current = totalsByCategory(
    within(flowsOf(input.entries, 'EXPENSE', input.currency), input.period).filter(
      (expense) => expense.date <= input.asOf,
    ),
  );
  const baselines = input.history
    .map(({ period, entries }) => ({
      period,
      expenses: within(flowsOf(entries, 'EXPENSE', input.currency), period),
    }))
    .filter(({ expenses }) => expenses.length > 0)
    .map(({ period, expenses }) =>
      totalsByCategory(
        expenses.filter((expense) => daysBetween(period.start, expense.date) < daysElapsed),
      ),
    );
  if (baselines.length < input.policy.minimumBaselinePeriods) {
    return [];
  }
  return [...current]
    .map(([categoryId, currentAmountMinor]) => {
      const baselineAmountMinor = divideRounded(
        sumMinor(baselines.map((totals) => totals.get(categoryId) ?? 0)),
        baselines.length,
      );
      return { categoryId, currentAmountMinor, baselineAmountMinor };
    })
    .filter(({ currentAmountMinor, baselineAmountMinor }) =>
      isUnusual(
        currentAmountMinor,
        baselineAmountMinor,
        input.policy.categorySpendingRatioBasisPoints,
        input.policy,
      ),
    )
    .map(({ categoryId, currentAmountMinor, baselineAmountMinor }) => ({
      type: 'UNUSUAL_CATEGORY_SPENDING' as const,
      categoryId,
      period: input.period,
      currency: input.currency,
      currentAmountMinor,
      baselineAmountMinor,
      differenceMinor: currentAmountMinor - baselineAmountMinor,
      ratioBasisPoints: ratioInBasisPoints(currentAmountMinor, baselineAmountMinor),
      baselinePeriods: baselines.length,
    }))
    .sort((left, right) => right.differenceMinor - left.differenceMinor);
}

function assessTransaction(
  candidate: LedgerEntry,
  history: readonly LedgerEntry[],
  { currency, policy }: LargeTransactionInput,
): UnusuallyLargeTransaction | undefined {
  const { categoryId } = candidate;
  if (categoryId === null) {
    return undefined;
  }
  const samples = history.filter(
    (expense) =>
      expense.categoryId === categoryId &&
      expense.id !== candidate.id &&
      expense.date <= candidate.date,
  );
  const baselineAmountMinor = lowerMedian(amountsOf(samples));
  if (
    baselineAmountMinor === undefined ||
    samples.length < policy.minimumSamples ||
    !isUnusual(
      candidate.amountMinor,
      baselineAmountMinor,
      policy.largeTransactionRatioBasisPoints,
      policy,
    )
  ) {
    return undefined;
  }
  return {
    type: 'UNUSUALLY_LARGE_TRANSACTION',
    transactionId: candidate.id,
    categoryId,
    memberId: candidate.memberId,
    merchant: candidate.merchant,
    date: candidate.date,
    currency,
    amountMinor: candidate.amountMinor,
    baselineAmountMinor,
    differenceMinor: candidate.amountMinor - baselineAmountMinor,
    ratioBasisPoints: ratioInBasisPoints(candidate.amountMinor, baselineAmountMinor),
    sampleSize: samples.length,
  };
}

function isUnusual(
  amountMinor: number,
  baselineAmountMinor: number,
  ratioBasisPoints: number,
  policy: FinancePolicy['anomaly'],
): boolean {
  return (
    baselineAmountMinor > 0 &&
    isAtLeastRatio(amountMinor, baselineAmountMinor, ratioBasisPoints) &&
    amountMinor - baselineAmountMinor >= policy.minimumDifferenceMinor
  );
}

function totalsByCategory(expenses: readonly LedgerEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const expense of expenses) {
    if (expense.categoryId !== null) {
      totals.set(
        expense.categoryId,
        sumMinor([totals.get(expense.categoryId) ?? 0, expense.amountMinor]),
      );
    }
  }
  return totals;
}
