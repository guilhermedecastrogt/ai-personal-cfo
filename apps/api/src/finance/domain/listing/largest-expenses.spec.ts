import { MixedCurrencyError } from '../../../money/money-math.js';
import { expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import { selectLargestExpenses } from './largest-expenses.js';

describe('selectLargestExpenses', () => {
  const entries = [
    expense(2300, { merchant: 'Lidl', date: '2026-10-05' }),
    expense(24000, { merchant: 'Tasting Menu', date: '2026-10-14' }),
    expense(180000, { merchant: 'Landlord', date: '2026-10-01' }),
    income(300000, { date: '2026-10-01' }),
    transfer(500000, { date: '2026-10-02' }),
  ];

  it('lists the largest expenses first and leaves out income and transfers', () => {
    expect(
      selectLargestExpenses(entries, 'EUR', 5).map((item) => [item.merchant, item.amountMinor]),
    ).toEqual([
      ['Landlord', 180000],
      ['Tasting Menu', 24000],
      ['Lidl', 2300],
    ]);
  });

  it('returns no more than the limit', () => {
    expect(selectLargestExpenses(entries, 'EUR', 1)).toHaveLength(1);
    expect(selectLargestExpenses(entries, 'EUR', 0)).toEqual([]);
  });

  it('puts the more recent of two equal amounts first', () => {
    const equal = [expense(1000, { date: '2026-10-01' }), expense(1000, { date: '2026-10-09' })];

    expect(selectLargestExpenses(equal, 'EUR', 2).map((item) => item.date)).toEqual([
      '2026-10-09',
      '2026-10-01',
    ]);
  });

  it('is empty when there are no expenses', () => {
    expect(selectLargestExpenses([], 'EUR', 5)).toEqual([]);
  });

  it('refuses entries in another currency', () => {
    expect(() => selectLargestExpenses([expense(1, { currency: 'BRL' })], 'EUR', 5)).toThrow(
      MixedCurrencyError,
    );
  });
});
