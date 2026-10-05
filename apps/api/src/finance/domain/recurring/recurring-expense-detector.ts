import { BASIS_POINTS_PER_WHOLE, ratioInBasisPoints } from '../../../money/money-math.js';
import type { FinancePolicy, RecurrenceCadence, RecurrenceFrequency } from '../finance-policy.js';
import { flowsOf, type LedgerEntry } from '../ledger/ledger-entry.js';
import { addDays, daysBetween, type IsoDate } from '../period/period.js';
import { lowerMedian } from '../statistics.js';

export type RecurringStatus = 'ACTIVE' | 'STOPPED';

export interface RecurringPriceChange {
  readonly direction: 'INCREASE' | 'DECREASE';
  readonly previousAmountMinor: number;
  readonly currentAmountMinor: number;
  readonly differenceMinor: number;
  readonly changeBasisPoints: number | null;
  readonly effectiveDate: IsoDate;
}

export interface RecurringPayer {
  readonly memberId: string;
  readonly occurrences: number;
}

export interface RecurringExpensePattern {
  readonly merchant: string;
  readonly merchantKey: string;
  readonly frequency: RecurrenceFrequency;
  readonly currency: string;
  readonly status: RecurringStatus;
  readonly typicalAmountMinor: number;
  readonly occurrences: number;
  readonly occurrencesPerYear: number;
  readonly firstDate: IsoDate;
  readonly establishedOn: IsoDate;
  readonly isNew: boolean;
  readonly lastDate: IsoDate;
  readonly nextExpectedDate: IsoDate;
  readonly priceChange: RecurringPriceChange | null;
  readonly categoryId: string | null;
  readonly memberIds: readonly string[];
  readonly payers: readonly RecurringPayer[];
  readonly evidence: {
    readonly dates: readonly IsoDate[];
    readonly amountsMinor: readonly number[];
    readonly intervalsInDays: readonly number[];
  };
}

export interface RecurringExpenseInput {
  readonly entries: readonly LedgerEntry[];
  readonly currency: string;
  readonly asOf: IsoDate;
  readonly policy: FinancePolicy['recurring'];
}

type RecurringPolicy = FinancePolicy['recurring'];

interface PriceLevels {
  readonly run: readonly LedgerEntry[];
  readonly current: readonly LedgerEntry[];
  readonly previous: readonly LedgerEntry[];
}

export function normalizeMerchant(merchant: string | null): string | null {
  const key = merchant?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  return key === '' ? null : key;
}

export function detectRecurringExpenses(input: RecurringExpenseInput): RecurringExpensePattern[] {
  const expensesByMerchant = new Map<string, LedgerEntry[]>();
  for (const expense of flowsOf(input.entries, 'EXPENSE', input.currency)) {
    const key = normalizeMerchant(expense.merchant);
    if (key !== null && expense.date <= input.asOf) {
      expensesByMerchant.set(key, [...(expensesByMerchant.get(key) ?? []), expense]);
    }
  }
  return [...expensesByMerchant]
    .map(([merchantKey, expenses]) => describePattern(merchantKey, expenses, input))
    .filter((pattern) => pattern !== undefined)
    .sort((left, right) => left.merchantKey.localeCompare(right.merchantKey));
}

function describePattern(
  merchantKey: string,
  unsorted: readonly LedgerEntry[],
  input: RecurringExpenseInput,
): RecurringExpensePattern | undefined {
  const expenses = [...unsorted].sort((left, right) => left.date.localeCompare(right.date));
  for (const cadence of input.policy.cadences) {
    const run = latestRun(expenses, cadence);
    const levels = run === undefined ? undefined : priceLevels(run, input.policy);
    if (levels !== undefined && levels.run.length >= input.policy.minimumOccurrences) {
      return toPattern(merchantKey, levels, cadence, input);
    }
  }
  return undefined;
}

function latestRun(
  expenses: readonly LedgerEntry[],
  cadence: RecurrenceCadence,
): LedgerEntry[] | undefined {
  const run: LedgerEntry[] = [];
  for (const expense of [...expenses].reverse()) {
    const later = run.at(0);
    if (later === undefined) {
      run.unshift(expense);
      continue;
    }
    const interval = daysBetween(expense.date, later.date);
    if (interval > cadence.intervalInDays + cadence.toleranceInDays) {
      break;
    }
    if (interval < cadence.intervalInDays - cadence.toleranceInDays) {
      return undefined;
    }
    run.unshift(expense);
  }
  return run;
}

function priceLevels(run: readonly LedgerEntry[], policy: RecurringPolicy): PriceLevels {
  const levels: LedgerEntry[][] = [];
  for (const expense of [...run].reverse()) {
    const level = levels.at(0);
    const reference = level?.at(-1)?.amountMinor;
    if (level === undefined || reference === undefined) {
      levels.unshift([expense]);
      continue;
    }
    if (isWithin(expense.amountMinor, reference, policy.amountToleranceBasisPoints)) {
      level.unshift(expense);
      continue;
    }
    if (!isWithin(expense.amountMinor, reference, policy.maximumPriceChangeBasisPoints)) {
      break;
    }
    if (levels.length > 1 && level.length === 1) {
      levels.shift();
      break;
    }
    levels.unshift([expense]);
  }
  return { run: levels.flat(), current: levels.at(-1) ?? [], previous: levels.at(-2) ?? [] };
}

function toPattern(
  merchantKey: string,
  levels: PriceLevels,
  cadence: RecurrenceCadence,
  { currency, asOf, policy }: RecurringExpenseInput,
): RecurringExpensePattern | undefined {
  const { run } = levels;
  const first = run.at(0);
  const last = run.at(-1);
  const established = run.at(policy.minimumOccurrences - 1);
  const typicalAmountMinor = lowerMedian(levels.current.map((expense) => expense.amountMinor));
  if (
    first === undefined ||
    last === undefined ||
    established === undefined ||
    typicalAmountMinor === undefined
  ) {
    return undefined;
  }
  const nextExpectedDate = addDays(last.date, cadence.intervalInDays);
  const daysOverdue = daysBetween(nextExpectedDate, asOf) - cadence.graceInDays;
  if (daysOverdue > policy.stoppedVisibleForDays) {
    return undefined;
  }
  const dates = run.map((expense) => expense.date);
  return {
    merchant: last.merchant?.trim() ?? merchantKey,
    merchantKey,
    frequency: cadence.frequency,
    currency,
    status: daysOverdue > 0 ? 'STOPPED' : 'ACTIVE',
    typicalAmountMinor,
    occurrences: run.length,
    occurrencesPerYear: cadence.occurrencesPerYear,
    firstDate: first.date,
    establishedOn: established.date,
    isNew: daysBetween(established.date, asOf) <= policy.recentChangeWithinDays,
    lastDate: last.date,
    nextExpectedDate,
    priceChange: priceChangeOf(levels, typicalAmountMinor, asOf, policy),
    categoryId: last.categoryId,
    memberIds: [...new Set(run.map((expense) => expense.memberId))].sort(),
    payers: payersOf(run),
    evidence: {
      dates,
      amountsMinor: run.map((expense) => expense.amountMinor),
      intervalsInDays: dates.slice(1).map((date, index) => daysBetween(dates[index] ?? date, date)),
    },
  };
}

function priceChangeOf(
  levels: PriceLevels,
  currentAmountMinor: number,
  asOf: IsoDate,
  policy: RecurringPolicy,
): RecurringPriceChange | null {
  const previousAmountMinor = lowerMedian(levels.previous.map((expense) => expense.amountMinor));
  const effectiveDate = levels.current.at(0)?.date;
  if (
    previousAmountMinor === undefined ||
    effectiveDate === undefined ||
    previousAmountMinor === currentAmountMinor ||
    daysBetween(effectiveDate, asOf) > policy.recentChangeWithinDays
  ) {
    return null;
  }
  const differenceMinor = currentAmountMinor - previousAmountMinor;
  return {
    direction: differenceMinor > 0 ? 'INCREASE' : 'DECREASE',
    previousAmountMinor,
    currentAmountMinor,
    differenceMinor,
    changeBasisPoints: ratioInBasisPoints(differenceMinor, previousAmountMinor),
    effectiveDate,
  };
}

function payersOf(run: readonly LedgerEntry[]): RecurringPayer[] {
  const occurrencesByMember = new Map<string, number>();
  for (const expense of run) {
    occurrencesByMember.set(expense.memberId, (occurrencesByMember.get(expense.memberId) ?? 0) + 1);
  }
  return [...occurrencesByMember]
    .map(([memberId, occurrences]) => ({ memberId, occurrences }))
    .sort(
      (left, right) =>
        right.occurrences - left.occurrences || left.memberId.localeCompare(right.memberId),
    );
}

function isWithin(amountMinor: number, referenceMinor: number, basisPoints: number): boolean {
  const deviation = BigInt(Math.abs(amountMinor - referenceMinor));
  return deviation * BigInt(BASIS_POINTS_PER_WHOLE) <= BigInt(referenceMinor) * BigInt(basisPoints);
}
