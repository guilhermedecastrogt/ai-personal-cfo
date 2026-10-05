import { assertSameCurrency, multiplyThenDivide, sumMinor } from '../../../money/money-math.js';
import type { RecurrenceFrequency } from '../finance-policy.js';
import { daysBetween, type IsoDate } from '../period/period.js';
import type {
  RecurringExpensePattern,
  RecurringPayer,
  RecurringPriceChange,
} from './recurring-expense-detector.js';

interface CommitmentBase {
  readonly merchant: string;
  readonly merchantKey: string;
  readonly frequency: RecurrenceFrequency;
  readonly categoryId: string | null;
  readonly typicalAmountMinor: number;
  readonly monthlyEquivalentMinor: number;
  readonly annualEquivalentMinor: number;
  readonly occurrences: number;
  readonly firstDate: IsoDate;
  readonly lastDate: IsoDate;
  readonly payers: readonly RecurringPayer[];
}

export interface RecurringCommitment extends CommitmentBase {
  readonly nextExpectedDate: IsoDate;
  readonly isNew: boolean;
  readonly priceChange: RecurringPriceChange | null;
}

export interface StoppedCommitment extends CommitmentBase {
  readonly missedDate: IsoDate;
}

export interface RecurringSummary {
  readonly currency: string;
  readonly monthlyEquivalentMinor: number;
  readonly annualEquivalentMinor: number;
  readonly commitments: readonly RecurringCommitment[];
  readonly stopped: readonly StoppedCommitment[];
}

export interface UpcomingCommitments {
  readonly currency: string;
  readonly from: IsoDate;
  readonly withinDays: number;
  readonly totalMinor: number;
  readonly upcoming: readonly RecurringCommitment[];
}

export interface RecurringChanges {
  readonly currency: string;
  readonly newCommitments: readonly RecurringCommitment[];
  readonly priceChanges: readonly RecurringCommitment[];
  readonly stopped: readonly StoppedCommitment[];
}

const MONTHS_PER_YEAR = 12;

export function summarizeRecurringExpenses(
  patterns: readonly RecurringExpensePattern[],
  currency: string,
): RecurringSummary {
  for (const pattern of patterns) {
    assertSameCurrency(currency, pattern.currency);
  }
  const commitments = patterns
    .filter((pattern) => pattern.status === 'ACTIVE')
    .map((pattern) => ({
      ...baseOf(pattern),
      nextExpectedDate: pattern.nextExpectedDate,
      isNew: pattern.isNew,
      priceChange: pattern.priceChange,
    }))
    .sort(byMonthlyEquivalent);
  const stopped = patterns
    .filter((pattern) => pattern.status === 'STOPPED')
    .map((pattern) => ({ ...baseOf(pattern), missedDate: pattern.nextExpectedDate }))
    .sort(byMonthlyEquivalent);
  return {
    currency,
    monthlyEquivalentMinor: sumMinor(
      commitments.map((commitment) => commitment.monthlyEquivalentMinor),
    ),
    annualEquivalentMinor: sumMinor(
      commitments.map((commitment) => commitment.annualEquivalentMinor),
    ),
    commitments,
    stopped,
  };
}

export function upcomingCommitments(
  summary: RecurringSummary,
  asOf: IsoDate,
  withinDays: number,
): UpcomingCommitments {
  const upcoming = summary.commitments
    .filter((commitment) => {
      const daysAway = daysBetween(asOf, commitment.nextExpectedDate);
      return daysAway >= 0 && daysAway <= withinDays;
    })
    .sort(
      (left, right) =>
        left.nextExpectedDate.localeCompare(right.nextExpectedDate) ||
        left.merchant.localeCompare(right.merchant),
    );
  return {
    currency: summary.currency,
    from: asOf,
    withinDays,
    totalMinor: sumMinor(upcoming.map((commitment) => commitment.typicalAmountMinor)),
    upcoming,
  };
}

export function recurringChanges(summary: RecurringSummary): RecurringChanges {
  return {
    currency: summary.currency,
    newCommitments: summary.commitments.filter((commitment) => commitment.isNew),
    priceChanges: summary.commitments.filter((commitment) => commitment.priceChange !== null),
    stopped: summary.stopped,
  };
}

function baseOf(pattern: RecurringExpensePattern): CommitmentBase {
  const annualEquivalentMinor = multiplyThenDivide(
    pattern.typicalAmountMinor,
    pattern.occurrencesPerYear,
    1,
  );
  return {
    merchant: pattern.merchant,
    merchantKey: pattern.merchantKey,
    frequency: pattern.frequency,
    categoryId: pattern.categoryId,
    typicalAmountMinor: pattern.typicalAmountMinor,
    monthlyEquivalentMinor: multiplyThenDivide(
      pattern.typicalAmountMinor,
      pattern.occurrencesPerYear,
      MONTHS_PER_YEAR,
    ),
    annualEquivalentMinor,
    occurrences: pattern.occurrences,
    firstDate: pattern.firstDate,
    lastDate: pattern.lastDate,
    payers: pattern.payers,
  };
}

function byMonthlyEquivalent(left: CommitmentBase, right: CommitmentBase): number {
  return (
    right.monthlyEquivalentMinor - left.monthlyEquivalentMinor ||
    left.merchant.localeCompare(right.merchant)
  );
}
