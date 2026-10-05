import { parseMoneyInput } from './parse-money-input.js';

describe('parseMoneyInput', () => {
  it.each([
    ['12,50', 'EUR', 1250],
    ['12.50', 'EUR', 1250],
    ['12', 'EUR', 1200],
    ['0,5', 'EUR', 50],
    ['1.234,56', 'EUR', 123456],
    ['1,234.56', 'EUR', 123456],
    ['1 234,56', 'EUR', 123456],
    ['1.234', 'EUR', 123400],
    ['1,234,567', 'EUR', 123456700],
    ['12,345', 'EUR', 1234500],
    ['1.500', 'JPY', 1500],
    ['  45,90 ', 'BRL', 4590],
  ])('reads %s %s as %d minor units', (text, currency, expected) => {
    expect(parseMoneyInput(text, currency)).toBe(expected);
  });

  it.each(['', '0', '0,00', '-5', '€12', '12,3456', '1.2.3', '12,5,0', ',50', '12,', 'abc', '1e3'])(
    'refuses %j',
    (text) => {
      expect(parseMoneyInput(text, 'EUR')).toBeUndefined();
    },
  );

  it('refuses amounts in an unknown currency', () => {
    expect(parseMoneyInput('12,50', 'XYZ')).toBeUndefined();
  });

  it('accepts zero only when asked to', () => {
    expect(parseMoneyInput('0', 'EUR', { allowZero: true })).toBe(0);
    expect(parseMoneyInput('0', 'EUR')).toBeUndefined();
  });

  it('refuses amounts beyond the safe integer range', () => {
    expect(parseMoneyInput('900000000000000000', 'EUR')).toBeUndefined();
  });
});
