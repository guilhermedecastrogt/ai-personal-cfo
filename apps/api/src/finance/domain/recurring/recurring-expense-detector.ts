import { BASIS_POINTS_PER_WHOLE } from '../../../money/money-math.js';
import type { FinancePolicy, RecurrenceCadence, RecurrenceFrequency } from '../finance-policy.js';
import { flowsOf, type LedgerEntry } from '../ledger/ledger-entry.js';
import { addDays, daysBetween, type IsoDate } from '../period/period.js';
import { lowerMedian } from '../statistics.js';

export interface RecurringExpensePattern {
  readonly merchant: string;
  readonly merchantKey: string;
  readonly frequency: RecurrenceFrequency;
  readonly currency: string;
  readonly typicalAmountMinor: number;
  readonly occurrences: number;
  readonly firstDate: IsoDate;
  readonly lastDate: IsoDate;
  readonly nextExpectedDate: IsoDate;
  readonly categoryId: string | null;
  readonly memberIds: readonly string[];
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
  { currency, asOf, policy }: RecurringExpenseInput,
): RecurringExpensePattern | undefined {
  const expenses = [...unsorted].sort((left, right) => left.date.localeCompare(right.date));
  const first = expenses.at(0);
  const last = expenses.at(-1);
  const amountsMinor = expenses.map((expense) => expense.amountMinor);
  const typicalAmountMinor = lowerMedian(amountsMinor);
  if (
    first === undefined ||
    last === undefined ||
    typicalAmountMinor === undefined ||
    expenses.length < policy.minimumOccurrences ||
    !amountsMinor.every((amount) => isCloseTo(amount, typicalAmountMinor, policy))
  ) {
    return undefined;
  }
  const dates = expenses.map((expense) => expense.date);
  const intervalsInDays = dates
    .slice(1)
    .map((date, index) => daysBetween(dates[index] ?? date, date));
  const cadence = policy.cadences.find((candidate) =>
    intervalsInDays.every((interval) => matchesCadence(interval, candidate)),
  );
  if (cadence === undefined || isStale(last.date, asOf, cadence, policy)) {
    return undefined;
  }
  return {
    merchant: last.merchant?.trim() ?? merchantKey,
    merchantKey,
    frequency: cadence.frequency,
    currency,
    typicalAmountMinor,
    occurrences: expenses.length,
    firstDate: first.date,
    lastDate: last.date,
    nextExpectedDate: addDays(last.date, cadence.intervalInDays),
    categoryId: last.categoryId,
    memberIds: [...new Set(expenses.map((expense) => expense.memberId))].sort(),
    evidence: { dates, amountsMinor, intervalsInDays },
  };
}

function isCloseTo(
  amountMinor: number,
  typicalAmountMinor: number,
  policy: FinancePolicy['recurring'],
): boolean {
  const deviation = BigInt(Math.abs(amountMinor - typicalAmountMinor));
  return (
    deviation * BigInt(BASIS_POINTS_PER_WHOLE) <=
    BigInt(typicalAmountMinor) * BigInt(policy.amountToleranceBasisPoints)
  );
}

function matchesCadence(intervalInDays: number, cadence: RecurrenceCadence): boolean {
  return Math.abs(intervalInDays - cadence.intervalInDays) <= cadence.toleranceInDays;
}

function isStale(
  lastDate: IsoDate,
  asOf: IsoDate,
  cadence: RecurrenceCadence,
  policy: FinancePolicy['recurring'],
): boolean {
  const longestGap =
    cadence.intervalInDays * policy.missedCyclesBeforeStale + cadence.toleranceInDays;
  return daysBetween(lastDate, asOf) > longestGap;
}
