import { assertExactInteger } from './money-math.js';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.js';
import { minorUnitDigits } from './money.js';

const PERCENT_FRACTION_DIGITS = 2;

type DecimalText = `${number}`;

function toDecimalText(value: number, fractionDigits: number): DecimalText {
  const digits = String(Math.abs(assertExactInteger(value))).padStart(fractionDigits + 1, '0');
  const whole = digits.slice(0, digits.length - fractionDigits);
  const fraction = digits.slice(digits.length - fractionDigits);
  const sign = value < 0 ? '-' : '';
  return (fractionDigits === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`) as DecimalText;
}

const DECIMAL_SEPARATOR: Readonly<Record<Locale, string>> = { en: '.', 'pt-BR': ',' };

export function formatMoney(
  amountMinor: number,
  currency: string,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    toDecimalText(amountMinor, minorUnitDigits(currency)),
  );
}

export function formatBasisPoints(basisPoints: number, locale: Locale = DEFAULT_LOCALE): string {
  const percent = toDecimalText(basisPoints, PERCENT_FRACTION_DIGITS)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '')
    .replace('.', DECIMAL_SEPARATOR[locale]);
  return `${percent}%`;
}
