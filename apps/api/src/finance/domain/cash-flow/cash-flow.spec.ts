import { MixedCurrencyError } from '../../../money/money-math.js';
import { expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import { calendarMonth } from '../period/period.js';
import { calculateSavings } from '../savings/savings.js';
import { calculateCashFlow, projectCashFlow } from './cash-flow.js';

describe('calculateCashFlow', () => {
  it('is positive when income exceeds expenses', () => {
    expect(calculateCashFlow([income(450000), expense(290000)], 'EUR')).toEqual({
      currency: 'EUR',
      incomeMinor: 450000,
      expensesMinor: 290000,
      netMinor: 160000,
    });
  });

  it('is negative when expenses exceed income', () => {
    expect(calculateCashFlow([income(200000), expense(260000)], 'EUR').netMinor).toBe(-60000);
  });

  it('is the negated expenses when there is no income', () => {
    expect(calculateCashFlow([expense(12000)], 'EUR')).toMatchObject({
      incomeMinor: 0,
      expensesMinor: 12000,
      netMinor: -12000,
    });
  });

  it('is zero when there are no transactions', () => {
    expect(calculateCashFlow([], 'EUR')).toMatchObject({
      incomeMinor: 0,
      expensesMinor: 0,
      netMinor: 0,
    });
  });

  it('is unchanged by transfers between accounts', () => {
    const withoutTransfer = calculateCashFlow([income(100000), expense(40000)], 'EUR');
    const withTransfer = calculateCashFlow(
      [income(100000), expense(40000), transfer(50000)],
      'EUR',
    );

    expect(withTransfer).toEqual(withoutTransfer);
  });

  it('fails instead of mixing currencies', () => {
    expect(() =>
      calculateCashFlow([income(1000), expense(500, { currency: 'BRL' })], 'EUR'),
    ).toThrow(MixedCurrencyError);
  });
});

describe('calculateSavings', () => {
  it('reports savings and the savings rate when income exceeds expenses', () => {
    const savings = calculateSavings(calculateCashFlow([income(450000), expense(290000)], 'EUR'));

    expect(savings).toEqual({
      currency: 'EUR',
      savingsMinor: 160000,
      savingsRateBasisPoints: 3556,
    });
  });

  it('reports negative savings and a negative rate when overspending', () => {
    const savings = calculateSavings(calculateCashFlow([income(200000), expense(260000)], 'EUR'));

    expect(savings).toMatchObject({ savingsMinor: -60000, savingsRateBasisPoints: -3000 });
  });

  it('has no savings rate when there is no income', () => {
    const savings = calculateSavings(calculateCashFlow([expense(12000)], 'EUR'));

    expect(savings).toMatchObject({ savingsMinor: -12000, savingsRateBasisPoints: null });
  });

  it('has no savings rate when there are no transactions', () => {
    const savings = calculateSavings(calculateCashFlow([], 'EUR'));

    expect(savings).toMatchObject({ savingsMinor: 0, savingsRateBasisPoints: null });
  });

  it('saves everything when nothing was spent', () => {
    const savings = calculateSavings(calculateCashFlow([income(100000)], 'EUR'));

    expect(savings.savingsRateBasisPoints).toBe(10000);
  });

  it('never produces a value that is not a finite integer', () => {
    const scenarios = [
      [],
      [expense(1)],
      [income(1)],
      [income(3), expense(1)],
      [income(1), expense(3)],
    ];

    for (const entries of scenarios) {
      const { savingsMinor, savingsRateBasisPoints } = calculateSavings(
        calculateCashFlow(entries, 'EUR'),
      );

      expect(Number.isSafeInteger(savingsMinor)).toBe(true);
      expect(savingsRateBasisPoints === null || Number.isSafeInteger(savingsRateBasisPoints)).toBe(
        true,
      );
    }
  });
});

describe('projectCashFlow', () => {
  it('subtracts projected expenses from expected income', () => {
    expect(projectCashFlow('EUR', calendarMonth(2026, 10), 450000, 478000)).toEqual({
      currency: 'EUR',
      period: calendarMonth(2026, 10),
      expectedIncomeMinor: 450000,
      projectedExpensesMinor: 478000,
      projectedNetMinor: -28000,
    });
  });
});
