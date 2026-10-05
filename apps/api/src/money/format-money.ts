import { assertExactInteger } from './money-math.js';
import { minorUnitDigits } from './money.js';

const DISPLAY_LOCALE = 'en';
const PERCENT_FRACTION_DIGITS = 2;

type DecimalText = `${number}`;

function toDecimalText(value: number, fractionDigits: number): DecimalText {
  const digits = String(Math.abs(assertExactInteger(value))).padStart(fractionDigits + 1, '0');
  const whole = digits.slice(0, digits.length - fractionDigits);
  const fraction = digits.slice(digits.length - fractionDigits);
  const sign = value < 0 ? '-' : '';
  return (fractionDigits === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`) as DecimalText;
}

export function formatMoney(amountMinor: number, currency: string): string {
  return new Intl.NumberFormat(DISPLAY_LOCALE, { style: 'currency', currency }).format(
    toDecimalText(amountMinor, minorUnitDigits(currency)),
  );
}

export function formatBasisPoints(basisPoints: number): string {
  const percent = toDecimalText(basisPoints, PERCENT_FRACTION_DIGITS)
    .replace(/0+$/, '')
    .replace(/\.$/, '');
  return `${percent}%`;
}
