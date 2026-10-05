import { MixedCurrencyError } from '../../../money/money-math.js';
import type { RecurrenceFrequency } from '../finance-policy.js';
import type { RecurringExpensePattern } from './recurring-expense-detector.js';
import {
  recurringChanges,
  summarizeRecurringExpenses,
  upcomingCommitments,
} from './recurring-summary.js';

const OCCURRENCES_PER_YEAR = { WEEKLY: 52, MONTHLY: 12, QUARTERLY: 4, YEARLY: 1 };

function pattern(
  merchant: string,
  frequency: RecurrenceFrequency,
  typicalAmountMinor: number,
  overrides: Partial<RecurringExpensePattern> = {},
): RecurringExpensePattern {
  return {
    merchant,
    merchantKey: merchant.toLowerCase(),
    frequency,
    currency: 'EUR',
    status: 'ACTIVE',
    typicalAmountMinor,
    occurrences: 3,
    occurrencesPerYear: OCCURRENCES_PER_YEAR[frequency],
    firstDate: '2026-08-01',
    establishedOn: '2026-10-01',
    isNew: false,
    lastDate: '2026-10-01',
    nextExpectedDate: '2026-11-01',
    priceChange: null,
    categoryId: null,
    memberIds: [],
    payers: [],
    evidence: { dates: [], amountsMinor: [], intervalsInDays: [] },
    ...overrides,
  };
}

const PRICE_CHANGE = {
  direction: 'INCREASE',
  previousAmountMinor: 1599,
  currentAmountMinor: 1899,
  differenceMinor: 300,
  changeBasisPoints: 1876,
  effectiveDate: '2026-09-05',
} as const;

describe('summarizeRecurringExpenses', () => {
  it('is empty when nothing recurs', () => {
    expect(summarizeRecurringExpenses([], 'EUR')).toEqual({
      currency: 'EUR',
      monthlyEquivalentMinor: 0,
      annualEquivalentMinor: 0,
      commitments: [],
      stopped: [],
    });
  });

  it.each([
    ['WEEKLY', 1200, 5200, 62400],
    ['MONTHLY', 1799, 1799, 21588],
    ['MONTHLY', 2000, 2000, 24000],
    ['QUARTERLY', 9000, 3000, 36000],
    ['YEARLY', 6000, 500, 6000],
    ['YEARLY', 10000, 833, 10000],
    ['WEEKLY', 999, 4329, 51948],
  ] as const)(
    'spreads a %s charge of %d to %d per month and %d per year',
    (frequency, amount, monthly, annual) => {
      const summary = summarizeRecurringExpenses([pattern('Service', frequency, amount)], 'EUR');

      expect(summary.commitments[0]?.monthlyEquivalentMinor).toBe(monthly);
      expect(summary.commitments[0]?.annualEquivalentMinor).toBe(annual);
    },
  );

  it('totals large commitments without losing a minor unit', () => {
    const summary = summarizeRecurringExpenses(
      [
        pattern('Mortgage', 'MONTHLY', 4_503_599_627_370),
        pattern('Insurance', 'YEARLY', 100_000_000_001),
      ],
      'EUR',
    );

    expect(summary.annualEquivalentMinor).toBe(54_143_195_528_441);
    expect(summary.monthlyEquivalentMinor).toBe(4_511_932_960_703);
  });

  it('leaves stopped commitments out of the totals and lists them apart', () => {
    const summary = summarizeRecurringExpenses(
      [
        pattern('Streaming', 'MONTHLY', 1799),
        pattern('Old Gym', 'MONTHLY', 3500, {
          status: 'STOPPED',
          lastDate: '2026-05-01',
          nextExpectedDate: '2026-05-31',
        }),
      ],
      'EUR',
    );

    expect(summary.monthlyEquivalentMinor).toBe(1799);
    expect(summary.annualEquivalentMinor).toBe(21588);
    expect(summary.commitments.map((commitment) => commitment.merchant)).toEqual(['Streaming']);
    expect(summary.stopped).toMatchObject([
      { merchant: 'Old Gym', lastDate: '2026-05-01', missedDate: '2026-05-31' },
    ]);
    expect(summary.stopped[0]).not.toHaveProperty('nextExpectedDate');
  });

  it('carries payers, novelty and the price change through unchanged', () => {
    const payers = [{ memberId: 'member-b', occurrences: 3 }];
    const summary = summarizeRecurringExpenses(
      [pattern('Streaming', 'MONTHLY', 1899, { payers, isNew: true, priceChange: PRICE_CHANGE })],
      'EUR',
    );

    expect(summary.commitments[0]).toMatchObject({
      payers,
      isNew: true,
      priceChange: PRICE_CHANGE,
    });
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
      summarizeRecurringExpenses(
        [pattern('Assinatura', 'MONTHLY', 5000, { currency: 'BRL' })],
        'EUR',
      ),
    ).toThrow(MixedCurrencyError);
  });
});

describe('upcomingCommitments', () => {
  const summary = summarizeRecurringExpenses(
    [
      pattern('Rent', 'MONTHLY', 180000, { nextExpectedDate: '2026-11-01' }),
      pattern('Streaming', 'MONTHLY', 1799, { nextExpectedDate: '2026-10-22' }),
      pattern('Gym', 'MONTHLY', 3500, { nextExpectedDate: '2026-10-19' }),
      pattern('Licence', 'YEARLY', 6000, { nextExpectedDate: '2027-03-01' }),
    ],
    'EUR',
  );

  it('lists what is expected within the window, soonest first, with its total', () => {
    expect(upcomingCommitments(summary, '2026-10-20', 14)).toMatchObject({
      currency: 'EUR',
      from: '2026-10-20',
      withinDays: 14,
      totalMinor: 181799,
      upcoming: [{ merchant: 'Streaming' }, { merchant: 'Rent' }],
    });
  });

  it('includes a charge expected today and excludes one already past', () => {
    expect(
      upcomingCommitments(summary, '2026-10-22', 0).upcoming.map((item) => item.merchant),
    ).toEqual(['Streaming']);
  });

  it('is empty, with a zero total, when nothing is due', () => {
    expect(upcomingCommitments(summary, '2026-12-01', 14)).toMatchObject({
      totalMinor: 0,
      upcoming: [],
    });
  });
});

describe('recurringChanges', () => {
  it('separates new commitments, price changes and stopped ones', () => {
    const changes = recurringChanges(
      summarizeRecurringExpenses(
        [
          pattern('Cloud', 'MONTHLY', 299, { isNew: true }),
          pattern('Streaming', 'MONTHLY', 1899, { priceChange: PRICE_CHANGE }),
          pattern('Rent', 'MONTHLY', 180000),
          pattern('Old Gym', 'MONTHLY', 3500, { status: 'STOPPED' }),
        ],
        'EUR',
      ),
    );

    expect(changes.newCommitments.map((item) => item.merchant)).toEqual(['Cloud']);
    expect(changes.priceChanges.map((item) => item.merchant)).toEqual(['Streaming']);
    expect(changes.stopped.map((item) => item.merchant)).toEqual(['Old Gym']);
  });

  it('reports nothing for a household whose commitments are unchanged', () => {
    expect(
      recurringChanges(summarizeRecurringExpenses([pattern('Rent', 'MONTHLY', 180000)], 'EUR')),
    ).toEqual({ currency: 'EUR', newCommitments: [], priceChanges: [], stopped: [] });
  });
});
