import { divideRounded, multiplyThenDivide, sumMinor } from '../../../money/money-math.js';
import { amountsOf, flowsOf, within, type LedgerEntry } from '../ledger/ledger-entry.js';
import {
  daysBetween,
  daysInRange,
  elapsedDays,
  type DateRange,
  type IsoDate,
} from '../period/period.js';

export type ForecastMethod = 'ACTUAL' | 'HISTORICAL_REMAINDER' | 'LINEAR_PACE';

export interface PeriodEntries {
  readonly period: DateRange;
  readonly entries: readonly LedgerEntry[];
}

export interface SpendingForecast {
  readonly currency: string;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly daysElapsed: number;
  readonly daysRemaining: number;
  readonly spentMinor: number;
  readonly projectedRemainingMinor: number;
  readonly projectedTotalMinor: number;
  readonly method: ForecastMethod;
  readonly historyPeriodsUsed: number;
}

export interface SpendingForecastInput {
  readonly currency: string;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly entries: readonly LedgerEntry[];
  readonly history: readonly PeriodEntries[];
}

interface Projection {
  readonly projectedRemainingMinor: number;
  readonly method: ForecastMethod;
  readonly historyPeriodsUsed: number;
}

export function forecastSpending(input: SpendingForecastInput): SpendingForecast {
  const daysElapsed = elapsedDays(input.period, input.asOf);
  const daysRemaining = daysInRange(input.period) - daysElapsed;
  const spentMinor = sumMinor(
    amountsOf(
      expensesIn(input.entries, input.period, input.currency).filter(
        (expense) => expense.date <= input.asOf,
      ),
    ),
  );
  const projection = projectRemainder(input, spentMinor, daysElapsed, daysRemaining);
  return {
    currency: input.currency,
    period: input.period,
    asOf: input.asOf,
    daysElapsed,
    daysRemaining,
    spentMinor,
    projectedTotalMinor: sumMinor([spentMinor, projection.projectedRemainingMinor]),
    ...projection,
  };
}

function projectRemainder(
  input: SpendingForecastInput,
  spentMinor: number,
  daysElapsed: number,
  daysRemaining: number,
): Projection {
  if (daysRemaining === 0) {
    return { projectedRemainingMinor: 0, method: 'ACTUAL', historyPeriodsUsed: 0 };
  }
  const remainders = input.history
    .map(({ period, entries }) => ({
      period,
      expenses: expensesIn(entries, period, input.currency),
    }))
    .filter(({ expenses }) => expenses.length > 0)
    .map(({ period, expenses }) => remainderAfter(expenses, period, daysElapsed));
  if (remainders.length > 0) {
    return {
      projectedRemainingMinor: divideRounded(sumMinor(remainders), remainders.length),
      method: 'HISTORICAL_REMAINDER',
      historyPeriodsUsed: remainders.length,
    };
  }
  return {
    projectedRemainingMinor:
      daysElapsed === 0 ? 0 : multiplyThenDivide(spentMinor, daysRemaining, daysElapsed),
    method: 'LINEAR_PACE',
    historyPeriodsUsed: 0,
  };
}

function remainderAfter(
  expenses: readonly LedgerEntry[],
  period: DateRange,
  daysElapsed: number,
): number {
  return sumMinor(
    amountsOf(expenses.filter((expense) => daysBetween(period.start, expense.date) >= daysElapsed)),
  );
}

function expensesIn(
  entries: readonly LedgerEntry[],
  period: DateRange,
  currency: string,
): LedgerEntry[] {
  return within(flowsOf(entries, 'EXPENSE', currency), period);
}
