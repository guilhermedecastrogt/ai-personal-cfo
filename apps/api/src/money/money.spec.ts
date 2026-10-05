import {
  InvalidMoneyError,
  isSupportedCurrency,
  minorUnitDigits,
  money,
  parseMoney,
} from './money.js';

describe('parseMoney', () => {
  it.each([
    ['43.27', 'EUR', 4327],
    ['43.2', 'EUR', 4320],
    ['43', 'EUR', 4300],
    ['0.01', 'EUR', 1],
    ['0.10', 'BRL', 10],
    ['1500', 'JPY', 1500],
    [' 23.00 ', 'EUR', 2300],
  ])('parses %s %s as %d minor units', (amount, currency, expected) => {
    expect(parseMoney(amount, currency)).toEqual({ amountMinor: expected, currency });
  });

  it.each(['0.1', '0.2', '0.3', '1.1', '4.35', '1.15', '8.2', '19.99', '1005.01'])(
    'converts %s without floating-point drift',
    (amount) => {
      const [whole = '', fraction = ''] = amount.split('.');
      const expected = Number(`${whole}${fraction.padEnd(2, '0')}`);

      expect(parseMoney(amount, 'EUR').amountMinor).toBe(expected);
    },
  );

  it.each(['', 'abc', '-5', '+5', '1,50', '1.', '.5', '1e3', '1.2.3'])(
    'rejects malformed amount "%s"',
    (amount) => {
      expect(() => parseMoney(amount, 'EUR')).toThrow(InvalidMoneyError);
    },
  );

  it('rejects more decimal places than the currency has', () => {
    expect(() => parseMoney('1.005', 'EUR')).toThrow(InvalidMoneyError);
    expect(() => parseMoney('100.5', 'JPY')).toThrow(InvalidMoneyError);
  });

  it('rejects an amount beyond the safe integer range', () => {
    expect(() => parseMoney('90071992547409.92', 'EUR')).toThrow(InvalidMoneyError);
  });

  it('accepts the largest representable amount', () => {
    expect(parseMoney('90071992547409.91', 'EUR').amountMinor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('rejects an unknown currency', () => {
    expect(() => parseMoney('1.00', 'XYZ')).toThrow(InvalidMoneyError);
    expect(() => parseMoney('1.00', 'eur')).toThrow(InvalidMoneyError);
  });
});

describe('money', () => {
  it('keeps the amount and currency it was given', () => {
    expect(money(4327, 'EUR')).toEqual({ amountMinor: 4327, currency: 'EUR' });
  });

  it.each([43.27, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects %d as a minor unit amount',
    (amountMinor) => {
      expect(() => money(amountMinor, 'EUR')).toThrow(InvalidMoneyError);
    },
  );

  it('rejects an unknown currency', () => {
    expect(() => money(100, 'EURO')).toThrow(InvalidMoneyError);
  });
});

describe('currency metadata', () => {
  it('knows how many minor unit digits a currency has', () => {
    expect(minorUnitDigits('EUR')).toBe(2);
    expect(minorUnitDigits('BRL')).toBe(2);
    expect(minorUnitDigits('JPY')).toBe(0);
  });

  it('recognises ISO 4217 codes only in upper case', () => {
    expect(isSupportedCurrency('EUR')).toBe(true);
    expect(isSupportedCurrency('eur')).toBe(false);
    expect(isSupportedCurrency('XYZ')).toBe(false);
  });
});
