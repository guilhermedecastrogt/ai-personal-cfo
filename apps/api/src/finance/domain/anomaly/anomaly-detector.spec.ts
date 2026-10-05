import { DEFAULT_FINANCE_POLICY } from '../finance-policy.js';
import type { PeriodEntries } from '../forecast/spending-forecast.js';
import { expense } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { calendarMonth } from '../period/period.js';
import {
  detectUnusualCategorySpending,
  detectUnusuallyLargeTransactions,
} from './anomaly-detector.js';

const POLICY = DEFAULT_FINANCE_POLICY.anomaly;

function dining(amountMinor: number, date: string): LedgerEntry {
  return expense(amountMinor, { categoryId: 'restaurants', date });
}

describe('detectUnusuallyLargeTransactions', () => {
  const history = [
    dining(2500, '2026-08-02'),
    dining(3000, '2026-08-15'),
    dining(3500, '2026-09-01'),
    dining(4000, '2026-09-12'),
    dining(2800, '2026-09-25'),
  ];

  function detect(
    candidates: readonly LedgerEntry[],
    past: readonly LedgerEntry[] = history,
  ): ReturnType<typeof detectUnusuallyLargeTransactions> {
    return detectUnusuallyLargeTransactions({
      currency: 'EUR',
      candidates,
      history: [...past, ...candidates],
      policy: POLICY,
    });
  }

  it('does not flag a transaction in the usual range', () => {
    expect(detect([dining(3800, '2026-10-03')])).toEqual([]);
  });

  it('flags a transaction several times the typical amount with its evidence', () => {
    const candidate = dining(14500, '2026-10-03');

    expect(detect([candidate])).toEqual([
      {
        type: 'UNUSUALLY_LARGE_TRANSACTION',
        transactionId: candidate.id,
        categoryId: 'restaurants',
        memberId: 'member-a',
        merchant: null,
        date: '2026-10-03',
        currency: 'EUR',
        amountMinor: 14500,
        baselineAmountMinor: 3000,
        differenceMinor: 11500,
        ratioBasisPoints: 48333,
        sampleSize: 5,
      },
    ]);
  });

  it('flags exactly at three times the typical amount and not just below', () => {
    expect(detect([dining(9000, '2026-10-03')])).toHaveLength(1);
    expect(detect([dining(8999, '2026-10-03')])).toEqual([]);
  });

  it('does not flag a large multiple of a trivially small typical amount', () => {
    const coffees = [300, 320, 350, 300, 310].map((amountMinor, index) =>
      expense(amountMinor, { categoryId: 'coffee', date: `2026-09-0${String(index + 1)}` }),
    );
    const candidate = expense(1500, { categoryId: 'coffee', date: '2026-10-03' });

    expect(detect([candidate], coffees)).toEqual([]);
  });

  it('needs enough history before judging', () => {
    expect(detect([dining(50000, '2026-10-03')], history.slice(0, 4))).toEqual([]);
  });

  it('compares only against the same category', () => {
    const rent = expense(180000, { categoryId: 'rent', date: '2026-10-01' });

    expect(detect([rent])).toEqual([]);
  });

  it('does not judge uncategorised transactions', () => {
    expect(detect([expense(500000, { date: '2026-10-03' })])).toEqual([]);
  });

  it('does not let a transaction count toward its own baseline or use later history', () => {
    const later = [5, 6, 7, 8, 9].map((day) => dining(90000, `2026-10-0${String(day)}`));

    expect(detect([dining(14500, '2026-10-03')], [...history, ...later])).toHaveLength(1);
  });
});

describe('detectUnusualCategorySpending', () => {
  const OCTOBER = calendarMonth(2026, 10);
  const history: PeriodEntries[] = [
    {
      period: calendarMonth(2026, 9),
      entries: [
        dining(12000, '2026-09-05'),
        dining(14000, '2026-09-18'),
        dining(9000, '2026-09-27'),
      ],
    },
    {
      period: calendarMonth(2026, 8),
      entries: [
        dining(10000, '2026-08-10'),
        dining(16000, '2026-08-19'),
        dining(20000, '2026-08-30'),
      ],
    },
  ];

  function detect(
    entries: readonly LedgerEntry[],
    past: readonly PeriodEntries[] = history,
    asOf = '2026-10-20',
  ): ReturnType<typeof detectUnusualCategorySpending> {
    return detectUnusualCategorySpending({
      currency: 'EUR',
      period: OCTOBER,
      asOf,
      entries,
      history: past,
      policy: POLICY,
    });
  }

  it('does not flag spending in line with the same point of previous months', () => {
    expect(detect([dining(27000, '2026-10-15')])).toEqual([]);
  });

  it('flags a category well above its baseline with the evidence', () => {
    expect(detect([dining(22000, '2026-10-08'), dining(20000, '2026-10-19')])).toEqual([
      {
        type: 'UNUSUAL_CATEGORY_SPENDING',
        categoryId: 'restaurants',
        period: OCTOBER,
        currency: 'EUR',
        currentAmountMinor: 42000,
        baselineAmountMinor: 26000,
        differenceMinor: 16000,
        ratioBasisPoints: 16154,
        baselinePeriods: 2,
      },
    ]);
  });

  it('compares against the same number of days of each previous month', () => {
    const early = detect([dining(15000, '2026-10-04')], history, '2026-10-05');

    expect(early[0]).toMatchObject({ currentAmountMinor: 15000, baselineAmountMinor: 6000 });
  });

  it('needs at least two previous periods with spending', () => {
    expect(detect([dining(90000, '2026-10-08')], history.slice(0, 1))).toEqual([]);
    expect(
      detect(
        [dining(90000, '2026-10-08')],
        [
          history[0] ?? { period: OCTOBER, entries: [] },
          { period: calendarMonth(2026, 8), entries: [] },
        ],
      ),
    ).toEqual([]);
  });

  it('does not flag a category with no baseline spending', () => {
    const groceries = expense(40000, { categoryId: 'groceries', date: '2026-10-08' });

    expect(detect([groceries])).toEqual([]);
  });

  it('does not flag a large ratio on a small absolute difference', () => {
    const smallHistory: PeriodEntries[] = [
      { period: calendarMonth(2026, 9), entries: [dining(1000, '2026-09-05')] },
      { period: calendarMonth(2026, 8), entries: [dining(1000, '2026-08-05')] },
    ];

    expect(detect([dining(4000, '2026-10-08')], smallHistory)).toEqual([]);
  });

  it('ignores spending dated after the reference date', () => {
    expect(detect([dining(90000, '2026-10-25')])).toEqual([]);
  });
});
