import { DEFAULT_FINANCE_POLICY } from '../finance-policy.js';
import { expense, income } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { detectRecurringExpenses, normalizeMerchant } from './recurring-expense-detector.js';

function detect(
  entries: readonly LedgerEntry[],
  asOf = '2026-10-05',
): ReturnType<typeof detectRecurringExpenses> {
  return detectRecurringExpenses({
    entries,
    currency: 'EUR',
    asOf,
    policy: DEFAULT_FINANCE_POLICY.recurring,
  });
}

function charges(
  merchant: string,
  amountMinor: number,
  dates: readonly string[],
  overrides: Partial<LedgerEntry> = {},
): LedgerEntry[] {
  return dates.map((date) => expense(amountMinor, { merchant, date, ...overrides }));
}

const MONTHLY_DATES = [
  '2026-05-03',
  '2026-06-03',
  '2026-07-03',
  '2026-08-03',
  '2026-09-03',
  '2026-10-03',
];

describe('detectRecurringExpenses', () => {
  it('detects a monthly charge of the same amount', () => {
    const [pattern, ...others] = detect(
      charges('Streaming Service', 1799, MONTHLY_DATES, { categoryId: 'subscriptions' }),
    );

    expect(others).toEqual([]);
    expect(pattern).toMatchObject({
      merchant: 'Streaming Service',
      merchantKey: 'streaming service',
      frequency: 'MONTHLY',
      currency: 'EUR',
      typicalAmountMinor: 1799,
      occurrences: 6,
      firstDate: '2026-05-03',
      lastDate: '2026-10-03',
      nextExpectedDate: '2026-11-02',
      categoryId: 'subscriptions',
      memberIds: ['member-a'],
    });
  });

  it('returns the evidence behind a detection', () => {
    const [pattern] = detect(charges('Gym', 3500, ['2026-08-01', '2026-09-01', '2026-10-01']));

    expect(pattern?.evidence).toEqual({
      dates: ['2026-08-01', '2026-09-01', '2026-10-01'],
      amountsMinor: [3500, 3500, 3500],
      intervalsInDays: [31, 30],
    });
  });

  it('detects weekly, quarterly and yearly cadences', () => {
    const patterns = detect(
      [
        ...charges('Weekly Box', 1200, ['2026-09-14', '2026-09-21', '2026-09-28', '2026-10-05']),
        ...charges('Quarterly Bill', 9000, [
          '2026-01-03',
          '2026-04-04',
          '2026-07-04',
          '2026-10-03',
        ]),
        ...charges('Annual Licence', 6000, ['2024-10-01', '2025-10-01', '2026-10-01']),
      ],
      '2026-10-05',
    );

    expect(patterns.map((pattern) => [pattern.merchant, pattern.frequency])).toEqual([
      ['Annual Licence', 'YEARLY'],
      ['Quarterly Bill', 'QUARTERLY'],
      ['Weekly Box', 'WEEKLY'],
    ]);
  });

  it('tolerates a price change within ten percent', () => {
    const entries = [
      ...charges('Music', 1099, ['2026-07-05', '2026-08-05']),
      ...charges('Music', 1199, ['2026-09-05', '2026-10-05']),
    ];

    expect(detect(entries)[0]).toMatchObject({ frequency: 'MONTHLY', typicalAmountMinor: 1099 });
  });

  it('tolerates the charge moving by a few days', () => {
    const entries = charges('Internet', 4500, [
      '2026-07-01',
      '2026-07-30',
      '2026-09-01',
      '2026-10-02',
    ]);

    expect(detect(entries)[0]?.frequency).toBe('MONTHLY');
  });

  it('treats differently written merchant names as the same merchant', () => {
    const entries = [
      expense(1799, { merchant: 'Streaming Service', date: '2026-08-03' }),
      expense(1799, { merchant: '  streaming   service ', date: '2026-09-03' }),
      expense(1799, { merchant: 'STREAMING SERVICE', date: '2026-10-03' }),
    ];

    expect(detect(entries)).toHaveLength(1);
  });

  it('lists every member who paid for a shared recurring expense', () => {
    const entries = [
      expense(1799, { merchant: 'Streaming', date: '2026-08-03', memberId: 'member-b' }),
      expense(1799, { merchant: 'Streaming', date: '2026-09-03', memberId: 'member-a' }),
      expense(1799, { merchant: 'Streaming', date: '2026-10-03', memberId: 'member-c' }),
    ];

    expect(detect(entries)[0]?.memberIds).toEqual(['member-a', 'member-b', 'member-c']);
  });

  it('needs at least three occurrences', () => {
    expect(detect(charges('Gym', 3500, ['2026-09-01', '2026-10-01']))).toEqual([]);
  });

  it('ignores a merchant visited at irregular intervals', () => {
    const entries = charges('Cafe', 450, ['2026-09-01', '2026-09-04', '2026-09-19', '2026-10-02']);

    expect(detect(entries)).toEqual([]);
  });

  it('ignores a regular merchant with varying amounts', () => {
    const entries = [
      expense(4310, { merchant: 'Supermarket', date: '2026-09-14' }),
      expense(8725, { merchant: 'Supermarket', date: '2026-09-21' }),
      expense(2990, { merchant: 'Supermarket', date: '2026-09-28' }),
      expense(6150, { merchant: 'Supermarket', date: '2026-10-05' }),
    ];

    expect(detect(entries)).toEqual([]);
  });

  it('ignores intervals that mix two cadences', () => {
    const entries = charges('Mixed', 1000, [
      '2026-08-01',
      '2026-08-08',
      '2026-09-08',
      '2026-10-08',
    ]);

    expect(detect(entries)).toEqual([]);
  });

  it('ignores several purchases on the same day', () => {
    const entries = charges('Kiosk', 500, ['2026-10-01', '2026-10-01', '2026-10-01']);

    expect(detect(entries)).toEqual([]);
  });

  it('ignores a pattern that stopped more than two cycles ago', () => {
    const entries = charges('Old Gym', 3500, ['2026-03-01', '2026-04-01', '2026-05-01']);

    expect(detect(entries, '2026-10-05')).toEqual([]);
    expect(detect(entries, '2026-06-20')).toHaveLength(1);
  });

  it('ignores expenses without a merchant, income and future-dated entries', () => {
    const entries = [
      ...charges('', 1000, ['2026-08-01', '2026-09-01', '2026-10-01']),
      ...MONTHLY_DATES.map((date) => income(210000, { merchant: 'Employer', date })),
      ...charges('Future', 1000, ['2026-11-01', '2026-12-01', '2027-01-01']),
    ];

    expect(detect(entries)).toEqual([]);
  });
});

describe('normalizeMerchant', () => {
  it('trims, lowercases and collapses whitespace', () => {
    expect(normalizeMerchant('  Corner   SHOP ')).toBe('corner shop');
  });

  it('has no key for a missing or blank merchant', () => {
    expect(normalizeMerchant(null)).toBeNull();
    expect(normalizeMerchant('   ')).toBeNull();
  });
});
