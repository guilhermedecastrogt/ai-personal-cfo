import { isSupportedCurrency, minorUnitDigits, parseMoney } from './money.js';

const SPACES = /[\s\u00a0\u202f]/g;
const GROUPED_WHOLE = /^\d{1,3}(?:[.,]\d{3})+$/;
const PLAIN_WHOLE = /^\d+$/;

export interface MoneyInputOptions {
  readonly allowZero?: boolean;
}

export function parseMoneyInput(
  text: string,
  currency: string,
  options: MoneyInputOptions = {},
): number | undefined {
  const compact = text.replace(SPACES, '');
  if (compact.length === 0 || !isSupportedCurrency(currency)) {
    return undefined;
  }
  const decimal = normalizeSeparators(compact, minorUnitDigits(currency));
  if (decimal === undefined) {
    return undefined;
  }
  try {
    const { amountMinor } = parseMoney(decimal, currency);
    return amountMinor > 0 || (options.allowZero === true && amountMinor === 0)
      ? amountMinor
      : undefined;
  } catch {
    return undefined;
  }
}

function normalizeSeparators(text: string, fractionDigits: number): string | undefined {
  const lastSeparator = Math.max(text.lastIndexOf(','), text.lastIndexOf('.'));
  if (lastSeparator === -1) {
    return text;
  }
  const whole = text.slice(0, lastSeparator);
  const fraction = text.slice(lastSeparator + 1);
  const separator = text.charAt(lastSeparator);
  const hasOtherSeparator = whole.includes(separator === ',' ? '.' : ',');
  const looksLikeGrouping =
    !hasOtherSeparator && fraction.length === 3 && fraction.length > fractionDigits;
  if (looksLikeGrouping) {
    return GROUPED_WHOLE.test(text) ? text.replace(/[.,]/g, '') : undefined;
  }
  if (whole.length === 0 || fraction.length === 0) {
    return undefined;
  }
  const digits = whole.replace(/[.,]/g, '');
  if (whole !== digits && !GROUPED_WHOLE.test(whole)) {
    return undefined;
  }
  if (whole.includes(separator) || !PLAIN_WHOLE.test(digits) || !PLAIN_WHOLE.test(fraction)) {
    return undefined;
  }
  return `${digits}.${fraction}`;
}
