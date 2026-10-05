import { expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';
import { calendarMonth } from '../period/period.js';
import { forecastSpending, type PeriodEntries } from './spending-forecast.js';

const OCTOBER = calendarMonth(2026, 10);
const SEPTEMBER = calendarMonth(2026, 9);
const AUGUST = calendarMonth(2026, 8);

function forecast(
  asOf: string,
  entries: readonly LedgerEntry[],
  history: readonly PeriodEntries[] = [],
): ReturnType<typeof forecastSpending> {
  return forecastSpending({ currency: 'EUR', period: OCTOBER, asOf, entries, history });
}

describe('forecastSpending', () => {
  describe('without history', () => {
    it('extends the pace so far over the rest of the month', () => {
      const result = forecast('2026-10-10', [
        expense(20000, { date: '2026-10-03' }),
        expense(10000, { date: '2026-10-10' }),
      ]);

      expect(result).toMatchObject({
        method: 'LINEAR_PACE',
        daysElapsed: 10,
        daysRemaining: 21,
        spentMinor: 30000,
        projectedRemainingMinor: 63000,
        projectedTotalMinor: 93000,
        historyPeriodsUsed: 0,
      });
    });

    it('rounds the projection to a whole minor unit', () => {
      const result = forecast('2026-10-07', [expense(1000, { date: '2026-10-01' })]);

      expect(result.projectedRemainingMinor).toBe(3429);
      expect(Number.isSafeInteger(result.projectedTotalMinor)).toBe(true);
    });

    it('projects nothing when nothing has been spent', () => {
      expect(forecast('2026-10-10', [])).toMatchObject({
        spentMinor: 0,
        projectedRemainingMinor: 0,
        projectedTotalMinor: 0,
      });
    });

    it('projects nothing before the period has started', () => {
      expect(forecast('2026-09-20', [])).toMatchObject({
        daysElapsed: 0,
        daysRemaining: 31,
        projectedTotalMinor: 0,
      });
    });
  });

  describe('with history', () => {
    const history: PeriodEntries[] = [
      {
        period: SEPTEMBER,
        entries: [
          expense(180000, { date: '2026-09-01' }),
          expense(30000, { date: '2026-09-08' }),
          expense(50000, { date: '2026-09-20' }),
        ],
      },
      {
        period: AUGUST,
        entries: [expense(180000, { date: '2026-08-01' }), expense(70000, { date: '2026-08-25' })],
      },
    ];

    it('adds what was typically spent in the rest of previous months', () => {
      const result = forecast('2026-10-10', [expense(180000, { date: '2026-10-01' })], history);

      expect(result).toMatchObject({
        method: 'HISTORICAL_REMAINDER',
        historyPeriodsUsed: 2,
        spentMinor: 180000,
        projectedRemainingMinor: 60000,
        projectedTotalMinor: 240000,
      });
    });

    it('does not multiply a large early payment across the month', () => {
      const result = forecast('2026-10-01', [expense(180000, { date: '2026-10-01' })], history);

      expect(result.projectedRemainingMinor).toBe(75000);
      expect(result.projectedTotalMinor).toBe(255000);
    });

    it('ignores history periods without any spending', () => {
      const result = forecast(
        '2026-10-10',
        [expense(1000, { date: '2026-10-01' })],
        [...history, { period: calendarMonth(2026, 7), entries: [] }],
      );

      expect(result.historyPeriodsUsed).toBe(2);
    });

    it('falls back to the linear pace when history holds no spending', () => {
      const result = forecast(
        '2026-10-10',
        [expense(10000, { date: '2026-10-01' })],
        [{ period: SEPTEMBER, entries: [income(100000, { date: '2026-09-01' })] }],
      );

      expect(result.method).toBe('LINEAR_PACE');
    });

    it('ignores history entries that fall outside their stated period', () => {
      const result = forecast(
        '2026-10-10',
        [],
        [{ period: SEPTEMBER, entries: [expense(99999, { date: '2026-08-31' })] }],
      );

      expect(result.method).toBe('LINEAR_PACE');
    });
  });

  it('reports the actual total once the period is over', () => {
    const entries = [
      expense(20000, { date: '2026-10-03' }),
      expense(10000, { date: '2026-10-31' }),
    ];

    expect(forecast('2026-10-31', entries)).toMatchObject({
      method: 'ACTUAL',
      daysRemaining: 0,
      projectedRemainingMinor: 0,
      projectedTotalMinor: 30000,
    });
    expect(forecast('2026-11-15', entries).projectedTotalMinor).toBe(30000);
  });

  it('counts only expenses of the period up to the reference date', () => {
    const result = forecast('2026-10-10', [
      expense(5000, { date: '2026-10-02' }),
      expense(7000, { date: '2026-10-20' }),
      expense(9000, { date: '2026-09-30' }),
      income(100000, { date: '2026-10-01' }),
      transfer(50000, { date: '2026-10-05' }),
    ]);

    expect(result.spentMinor).toBe(5000);
  });
});
