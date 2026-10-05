export interface Money {
  readonly amountMinor: number;
  readonly currency: string;
}

export class InvalidMoneyError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = InvalidMoneyError.name;
  }
}

const DECIMAL_AMOUNT = /^(\d+)(?:\.(\d+))?$/;
const DECIMAL_BASE = 10n;

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(Intl.supportedValuesOf('currency'));

export function isSupportedCurrency(currency: string): boolean {
  return SUPPORTED_CURRENCIES.has(currency);
}

export function minorUnitDigits(currency: string): number {
  assertSupportedCurrency(currency);
  const format = new Intl.NumberFormat('en', { style: 'currency', currency });
  return format.resolvedOptions().maximumFractionDigits ?? 0;
}

export function money(amountMinor: number, currency: string): Money {
  assertSupportedCurrency(currency);
  if (!Number.isSafeInteger(amountMinor)) {
    throw new InvalidMoneyError('Amount must be a safe integer number of minor units');
  }
  return { amountMinor, currency };
}

export function parseMoney(amount: string, currency: string): Money {
  const digits = minorUnitDigits(currency);
  const match = DECIMAL_AMOUNT.exec(amount.trim());
  if (match === null) {
    throw new InvalidMoneyError('Amount must be a non-negative decimal number');
  }
  const [, whole = '0', fraction = ''] = match;
  if (fraction.length > digits) {
    throw new InvalidMoneyError(`Amount has more than ${String(digits)} decimal places`);
  }
  const amountMinor =
    BigInt(whole) * DECIMAL_BASE ** BigInt(digits) + BigInt(fraction.padEnd(digits, '0') || '0');
  if (amountMinor > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidMoneyError('Amount is too large');
  }
  return { amountMinor: Number(amountMinor), currency };
}

function assertSupportedCurrency(currency: string): void {
  if (!isSupportedCurrency(currency)) {
    throw new InvalidMoneyError('Currency is not a supported ISO 4217 code');
  }
}
