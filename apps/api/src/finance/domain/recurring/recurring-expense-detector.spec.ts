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

  it('needs the same evidence for every cadence', () => {
    expect(detect(charges('Box', 1200, ['2026-09-28', '2026-10-05']))).toEqual([]);
    expect(detect(charges('Bill', 9000, ['2026-07-04', '2026-10-03']))).toEqual([]);
    expect(detect(charges('Licence', 6000, ['2025-10-01', '2026-10-01']))).toEqual([]);
  });

  it('ignores an extra charge between cycles, which a subscription would not have', () => {
    const entries = [
      ...charges('Shop', 2000, ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']),
      ...charges('Shop', 2000, ['2026-09-20']),
    ];

    expect(detect(entries)).toEqual([]);
  });

  it('starts again from the latest unbroken run after a pause', () => {
    const entries = charges('Gym', 3500, [
      '2025-11-01',
      '2025-12-01',
      '2026-01-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
      '2026-10-01',
    ]);

    expect(detect(entries)[0]).toMatchObject({
      occurrences: 4,
      firstDate: '2026-07-01',
      establishedOn: '2026-09-01',
      evidence: { intervalsInDays: [31, 31, 30] },
    });
  });

  describe('amounts', () => {
    it('treats a small variation as the same price, with no price change', () => {
      const entries = [
        ...charges('Electricity', 6000, ['2026-07-05']),
        ...charges('Electricity', 6400, ['2026-08-05']),
        ...charges('Electricity', 5800, ['2026-09-05']),
        ...charges('Electricity', 6100, ['2026-10-05']),
      ];

      expect(detect(entries)[0]).toMatchObject({ typicalAmountMinor: 6000, priceChange: null });
    });

    it('keeps one commitment across a price increase and reports the change exactly', () => {
      const entries = [
        ...charges('Streaming', 1599, ['2026-07-05', '2026-08-05']),
        ...charges('Streaming', 1899, ['2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)).toHaveLength(1);
      expect(detect(entries)[0]).toMatchObject({
        occurrences: 4,
        typicalAmountMinor: 1899,
        priceChange: {
          direction: 'INCREASE',
          previousAmountMinor: 1599,
          currentAmountMinor: 1899,
          differenceMinor: 300,
          changeBasisPoints: 1876,
          effectiveDate: '2026-09-05',
        },
      });
    });

    it('recognises a new price from its first charge', () => {
      const entries = [
        ...charges('Streaming', 1599, ['2026-08-05', '2026-09-05']),
        ...charges('Streaming', 1799, ['2026-10-05']),
      ];

      expect(detect(entries)[0]).toMatchObject({
        typicalAmountMinor: 1799,
        priceChange: { previousAmountMinor: 1599, effectiveDate: '2026-10-05' },
      });
    });

    it('reports a price decrease with a negative difference', () => {
      const entries = [
        ...charges('Phone Plan', 3000, ['2026-06-05', '2026-07-05', '2026-08-05']),
        ...charges('Phone Plan', 2000, ['2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)[0]?.priceChange).toMatchObject({
        direction: 'DECREASE',
        differenceMinor: -1000,
        changeBasisPoints: -3333,
      });
    });

    it('no longer reports a price change once it is old', () => {
      const entries = [
        ...charges('Streaming', 1599, ['2026-01-05', '2026-02-05']),
        ...charges('Streaming', 1899, MONTHLY_DATES),
      ];

      expect(detect(entries)[0]).toMatchObject({ typicalAmountMinor: 1899, priceChange: null });
    });

    it('rejects a jump too large to be the same commitment', () => {
      const entries = [
        ...charges('Store', 1000, ['2026-07-05', '2026-08-05']),
        ...charges('Store', 2500, ['2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)).toEqual([]);
    });

    it('starts a separate commitment after a jump too large, once it has three charges', () => {
      const entries = [
        ...charges('Store', 1000, ['2026-05-05', '2026-06-05']),
        ...charges('Store', 2500, ['2026-07-05', '2026-08-05', '2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)[0]).toMatchObject({
        typicalAmountMinor: 2500,
        occurrences: 4,
        firstDate: '2026-07-05',
        priceChange: null,
      });
    });

    it('recovers three charges after a one-off different amount, without a false price change', () => {
      const entries = [
        ...charges('Utility', 3000, ['2026-05-05', '2026-06-05']),
        ...charges('Utility', 4000, ['2026-07-05']),
        ...charges('Utility', 3000, ['2026-08-05', '2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)[0]).toMatchObject({
        occurrences: 3,
        firstDate: '2026-08-05',
        typicalAmountMinor: 3000,
        priceChange: null,
      });
    });

    it('rejects a one-off different amount in the middle of a run', () => {
      const entries = [
        ...charges('Utility', 3000, ['2026-06-05', '2026-07-05']),
        ...charges('Utility', 4000, ['2026-08-05']),
        ...charges('Utility', 3000, ['2026-09-05', '2026-10-05']),
      ];

      expect(detect(entries)).toEqual([]);
    });
  });

  describe('status', () => {
    const entries = charges('Gym', 3500, ['2026-03-01', '2026-04-01', '2026-05-01']);

    it('is active up to the expected date plus the grace period', () => {
      expect(detect(entries, '2026-05-31')[0]).toMatchObject({
        status: 'ACTIVE',
        nextExpectedDate: '2026-05-31',
      });
      expect(detect(entries, '2026-06-10')[0]?.status).toBe('ACTIVE');
    });

    it('appears to have stopped once the grace period has passed', () => {
      expect(detect(entries, '2026-06-11')[0]).toMatchObject({
        status: 'STOPPED',
        lastDate: '2026-05-01',
        nextExpectedDate: '2026-05-31',
      });
    });

    it('is forgotten some time after it stopped', () => {
      expect(detect(entries, '2026-10-08')).toHaveLength(1);
      expect(detect(entries, '2026-10-09')).toEqual([]);
    });

    it.each([
      ['Weekly Box', ['2026-09-14', '2026-09-21', '2026-09-28'], '2026-10-08', '2026-10-09'],
      ['Quarterly Bill', ['2026-01-03', '2026-04-04', '2026-07-04'], '2026-10-23', '2026-10-24'],
      ['Annual Licence', ['2023-10-01', '2024-10-01', '2025-10-01'], '2026-11-15', '2026-11-16'],
    ] as const)(
      'uses a grace period that fits %s',
      (merchant, dates, lastActiveDay, stoppedDay) => {
        expect(detect(charges(merchant, 1000, dates), lastActiveDay)[0]?.status).toBe('ACTIVE');
        expect(detect(charges(merchant, 1000, dates), stoppedDay)[0]?.status).toBe('STOPPED');
      },
    );
  });

  describe('new commitments', () => {
    it('is new from its third charge and for a limited time', () => {
      const entries = charges('Cloud Storage', 299, ['2026-06-01', '2026-07-01', '2026-08-01']);

      expect(detect(entries, '2026-08-01')[0]).toMatchObject({
        isNew: true,
        establishedOn: '2026-08-01',
      });
      expect(detect(entries, '2026-08-20')[0]?.isNew).toBe(true);
    });

    it('is not new when it has been established for a long time', () => {
      expect(detect(charges('Streaming', 1799, MONTHLY_DATES))[0]).toMatchObject({
        isNew: false,
        establishedOn: '2026-07-03',
      });
    });
  });

  describe('payers', () => {
    it('counts how often each member paid, most frequent first', () => {
      const entries = [
        expense(1799, { merchant: 'Streaming', date: '2026-07-03', memberId: 'member-b' }),
        expense(1799, { merchant: 'Streaming', date: '2026-08-03', memberId: 'member-c' }),
        expense(1799, { merchant: 'Streaming', date: '2026-09-03', memberId: 'member-b' }),
        expense(1799, { merchant: 'Streaming', date: '2026-10-03', memberId: 'member-a' }),
      ];

      expect(detect(entries)[0]?.payers).toEqual([
        { memberId: 'member-b', occurrences: 2 },
        { memberId: 'member-a', occurrences: 1 },
        { memberId: 'member-c', occurrences: 1 },
      ]);
    });

    it('has a single payer in a household of one', () => {
      expect(detect(charges('Streaming', 1799, MONTHLY_DATES))[0]?.payers).toEqual([
        { memberId: 'member-a', occurrences: 6 },
      ]);
    });
  });

  it('gives the same result every time for the same ledger', () => {
    const entries = [
      ...charges('Streaming', 1599, ['2026-07-05', '2026-08-05']),
      ...charges('Streaming', 1899, ['2026-09-05', '2026-10-05']),
    ];

    expect(detect([...entries].reverse())).toEqual(detect(entries));
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
