import {
  AmountOutOfRangeError,
  DivisionByZeroError,
  MixedCurrencyError,
  assertSameCurrency,
  divideRounded,
  isAtLeastRatio,
  multiplyThenDivide,
  ratioInBasisPoints,
  sumMinor,
} from './money-math.js';

describe('sumMinor', () => {
  it('adds amounts exactly where floating point would drift', () => {
    expect(sumMinor([10, 20])).toBe(30);
    expect(sumMinor([1050, 2399])).toBe(3449);
  });

  it('is zero for no amounts', () => {
    expect(sumMinor([])).toBe(0);
  });

  it('handles negative amounts', () => {
    expect(sumMinor([500, -800])).toBe(-300);
  });

  it('rejects fractional amounts', () => {
    expect(() => sumMinor([10.5])).toThrow(AmountOutOfRangeError);
  });

  it('rejects a total beyond the exact integer range', () => {
    expect(() => sumMinor([Number.MAX_SAFE_INTEGER, 1])).toThrow(AmountOutOfRangeError);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY])('rejects %d', (value) => {
    expect(() => sumMinor([value])).toThrow(AmountOutOfRangeError);
  });
});

describe('divideRounded', () => {
  it.each([
    [10, 4, 3],
    [9, 4, 2],
    [10, 3, 3],
    [11, 3, 4],
    [1, 2, 1],
    [-1, 2, -1],
    [-10, 4, -3],
    [0, 5, 0],
  ])('divides %d by %d as %d, rounding half away from zero', (numerator, denominator, expected) => {
    expect(divideRounded(numerator, denominator)).toBe(expected);
  });

  it('refuses to divide by zero', () => {
    expect(() => divideRounded(100, 0)).toThrow(DivisionByZeroError);
  });
});

describe('multiplyThenDivide', () => {
  it('multiplies before dividing so no precision is lost', () => {
    expect(multiplyThenDivide(1000, 31, 5)).toBe(6200);
    expect(multiplyThenDivide(100, 1, 3)).toBe(33);
    expect(multiplyThenDivide(200, 1, 3)).toBe(67);
  });

  it('handles intermediate products beyond the safe integer range', () => {
    expect(multiplyThenDivide(Number.MAX_SAFE_INTEGER, 1000, 1000)).toBe(Number.MAX_SAFE_INTEGER);
  });
});

describe('ratioInBasisPoints', () => {
  it.each([
    [246, 300, 8200],
    [85, 255, 3333],
    [1, 3, 3333],
    [2, 3, 6667],
    [300, 300, 10000],
    [450, 300, 15000],
    [0, 300, 0],
    [-150, 300, -5000],
  ])('expresses %d of %d as %d basis points', (part, whole, expected) => {
    expect(ratioInBasisPoints(part, whole)).toBe(expected);
  });

  it('has no value when the whole is zero', () => {
    expect(ratioInBasisPoints(100, 0)).toBeNull();
    expect(ratioInBasisPoints(0, 0)).toBeNull();
  });
});

describe('isAtLeastRatio', () => {
  it('compares exactly at the boundary', () => {
    expect(isAtLeastRatio(300, 100, 30000)).toBe(true);
    expect(isAtLeastRatio(299, 100, 30000)).toBe(false);
  });
});

describe('assertSameCurrency', () => {
  it('accepts matching currencies', () => {
    expect(() => {
      assertSameCurrency('EUR', 'EUR');
    }).not.toThrow();
  });

  it('refuses to combine different currencies', () => {
    expect(() => {
      assertSameCurrency('EUR', 'BRL');
    }).toThrow(MixedCurrencyError);
  });
});
