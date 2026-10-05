import { assertSameCurrency, multiplyThenDivide, sumMinor } from '../../../money/money-math.js';
import type { RecurrenceFrequency } from '../finance-policy.js';
import type { RecurringExpensePattern } from './recurring-expense-detector.js';

export interface RecurringCommitment {
  readonly merchant: string;
  readonly frequency: RecurrenceFrequency;
  readonly categoryId: string | null;
  readonly typicalAmountMinor: number;
  readonly monthlyEquivalentMinor: number;
}

export interface RecurringSummary {
  readonly currency: string;
  readonly monthlyEquivalentMinor: number;
  readonly commitments: readonly RecurringCommitment[];
}

const MONTHS_PER_YEAR = 12;

const OCCURRENCES_PER_YEAR: Record<RecurrenceFrequency, number> = {
  WEEKLY: 52,
  MONTHLY: 12,
  QUARTERLY: 4,
  YEARLY: 1,
};

export function summarizeRecurringExpenses(
  patterns: readonly RecurringExpensePattern[],
  currency: string,
): RecurringSummary {
  const commitments = patterns
    .map((pattern) => {
      assertSameCurrency(currency, pattern.currency);
      return {
        merchant: pattern.merchant,
        frequency: pattern.frequency,
        categoryId: pattern.categoryId,
        typicalAmountMinor: pattern.typicalAmountMinor,
        monthlyEquivalentMinor: multiplyThenDivide(
          pattern.typicalAmountMinor,
          OCCURRENCES_PER_YEAR[pattern.frequency],
          MONTHS_PER_YEAR,
        ),
      };
    })
    .sort(
      (left, right) =>
        right.monthlyEquivalentMinor - left.monthlyEquivalentMinor ||
        left.merchant.localeCompare(right.merchant),
    );
  return {
    currency,
    monthlyEquivalentMinor: sumMinor(
      commitments.map((commitment) => commitment.monthlyEquivalentMinor),
    ),
    commitments,
  };
}
