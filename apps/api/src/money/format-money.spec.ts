import { formatAmountInput, formatBasisPoints, formatMoney } from './format-money.js';

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

describe('Brazilian Portuguese formatting', () => {
  it.each([
    [1200, 'EUR', '€ 12,00'],
    [182698, 'EUR', '€ 1.826,98'],
    [-1050, 'EUR', '-€ 10,50'],
    [5000, 'BRL', 'R$ 50,00'],
    [1000, 'JPY', 'JP¥ 1.000'],
  ])('formats %d %s as %s', (amountMinor, currency, expected) => {
    expect(formatMoney(amountMinor, currency, 'pt-BR').replace(/\s/g, ' ')).toBe(expected);
  });

  it.each([
    [1876, '18,76%'],
    [10000, '100%'],
    [2500, '25%'],
    [-3333, '-33,33%'],
  ])('formats %d basis points as %s', (basisPoints, expected) => {
    expect(formatBasisPoints(basisPoints, 'pt-BR')).toBe(expected);
  });
});

describe('formatAmountInput', () => {
  it.each([
    [1250, 'EUR', 'en', '12.50'],
    [1250, 'EUR', 'pt-BR', '12,50'],
    [123456, 'BRL', 'pt-BR', '1234,56'],
    [5, 'EUR', 'pt-BR', '0,05'],
    [1500, 'JPY', 'pt-BR', '1500'],
  ] as const)('writes %d %s for %s as %s', (amountMinor, currency, locale, expected) => {
    expect(formatAmountInput(amountMinor, currency, locale)).toBe(expected);
  });
});
