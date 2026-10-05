import { MixedCurrencyError } from '../../../money/money-math.js';
import type { RecurrenceFrequency } from '../finance-policy.js';
import type { RecurringExpensePattern } from './recurring-expense-detector.js';
import { summarizeRecurringExpenses } from './recurring-summary.js';

function pattern(
  merchant: string,
  frequency: RecurrenceFrequency,
  typicalAmountMinor: number,
  currency = 'EUR',
): RecurringExpensePattern {
  return {
    merchant,
    merchantKey: merchant.toLowerCase(),
    frequency,
    currency,
    typicalAmountMinor,
    occurrences: 3,
    firstDate: '2026-08-01',
    lastDate: '2026-10-01',
    nextExpectedDate: '2026-11-01',
    categoryId: null,
    memberIds: [],
    evidence: { dates: [], amountsMinor: [], intervalsInDays: [] },
  };
}

describe('summarizeRecurringExpenses', () => {
  it('is empty when nothing recurs', () => {
    expect(summarizeRecurringExpenses([], 'EUR')).toEqual({
      currency: 'EUR',
      monthlyEquivalentMinor: 0,
      commitments: [],
    });
  });

  it.each([
    ['WEEKLY', 1200, 5200],
    ['MONTHLY', 1799, 1799],
    ['QUARTERLY', 9000, 3000],
    ['YEARLY', 6000, 500],
    ['YEARLY', 10000, 833],
  ] as const)('spreads a %s charge of %d to %d per month', (frequency, amount, monthly) => {
    const summary = summarizeRecurringExpenses([pattern('Service', frequency, amount)], 'EUR');

    expect(summary.commitments[0]?.monthlyEquivalentMinor).toBe(monthly);
  });

  it('totals the monthly equivalents and lists the largest first', () => {
    const summary = summarizeRecurringExpenses(
      [
        pattern('Streaming', 'MONTHLY', 1799),
        pattern('Rent', 'MONTHLY', 180000),
        pattern('Licence', 'YEARLY', 6000),
      ],
      'EUR',
    );

    expect(summary.monthlyEquivalentMinor).toBe(182299);
    expect(summary.commitments.map((commitment) => commitment.merchant)).toEqual([
      'Rent',
      'Streaming',
      'Licence',
    ]);
  });

  it('refuses to total commitments in different currencies', () => {
    expect(() =>
      summarizeRecurringExpenses([pattern('Assinatura', 'MONTHLY', 5000, 'BRL')], 'EUR'),
    ).toThrow(MixedCurrencyError);
  });
});
