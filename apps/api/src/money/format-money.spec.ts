import { formatBasisPoints, formatMoney } from './format-money.js';

describe('formatMoney', () => {
  it.each([
    [4327, 'EUR', '€43.27'],
    [62500, 'EUR', '€625.00'],
    [5, 'EUR', '€0.05'],
    [0, 'EUR', '€0.00'],
    [-12000, 'EUR', '-€120.00'],
    [123456789, 'EUR', '€1,234,567.89'],
    [1500, 'JPY', '¥1,500'],
    [5000, 'BRL', 'R$50.00'],
  ])('formats %d %s as %s', (amountMinor, currency, expected) => {
    expect(formatMoney(amountMinor, currency)).toBe(expected);
  });

  it('formats the largest representable amount without losing a cent', () => {
    expect(formatMoney(Number.MAX_SAFE_INTEGER, 'EUR')).toBe('€90,071,992,547,409.91');
  });
});

describe('formatBasisPoints', () => {
  it.each([
    [8200, '82%'],
    [3333, '33.33%'],
    [10000, '100%'],
    [14050, '140.5%'],
    [0, '0%'],
    [5, '0.05%'],
    [-2500, '-25%'],
  ])('formats %d basis points as %s', (basisPoints, expected) => {
    expect(formatBasisPoints(basisPoints)).toBe(expected);
  });
});
