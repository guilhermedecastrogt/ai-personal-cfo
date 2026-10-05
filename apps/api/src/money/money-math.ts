export const BASIS_POINTS_PER_WHOLE = 10_000;

export class MixedCurrencyError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`Cannot combine ${actual} with ${expected} without an explicit conversion`);
    this.name = MixedCurrencyError.name;
  }
}

export class AmountOutOfRangeError extends Error {
  constructor() {
    super('Amount is outside the range of exactly representable integers');
    this.name = AmountOutOfRangeError.name;
  }
}

export class DivisionByZeroError extends Error {
  constructor() {
    super('Cannot divide an amount by zero');
    this.name = DivisionByZeroError.name;
  }
}

export function assertSameCurrency(expected: string, actual: string): void {
  if (expected !== actual) {
    throw new MixedCurrencyError(expected, actual);
  }
}

export function assertExactInteger(value: number): number {
  if (!Number.isSafeInteger(value)) {
    throw new AmountOutOfRangeError();
  }
  return value;
}

export function sumMinor(amounts: Iterable<number>): number {
  let total = 0;
  for (const amount of amounts) {
    total = assertExactInteger(total + assertExactInteger(amount));
  }
  return total;
}

export function divideRounded(numerator: number, denominator: number): number {
  return toExactNumber(
    divideRoundingHalfAwayFromZero(
      BigInt(assertExactInteger(numerator)),
      BigInt(assertExactInteger(denominator)),
    ),
  );
}

export function multiplyThenDivide(amount: number, multiplier: number, divisor: number): number {
  const product = BigInt(assertExactInteger(amount)) * BigInt(assertExactInteger(multiplier));
  return toExactNumber(
    divideRoundingHalfAwayFromZero(product, BigInt(assertExactInteger(divisor))),
  );
}

export function ratioInBasisPoints(part: number, whole: number): number | null {
  if (whole === 0) {
    return null;
  }
  return multiplyThenDivide(part, BASIS_POINTS_PER_WHOLE, whole);
}

export function isAtLeastRatio(amount: number, reference: number, basisPoints: number): boolean {
  return (
    BigInt(assertExactInteger(amount)) * BigInt(BASIS_POINTS_PER_WHOLE) >=
    BigInt(assertExactInteger(reference)) * BigInt(basisPoints)
  );
}

function divideRoundingHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator === 0n) {
    throw new DivisionByZeroError();
  }
  const isNegative = numerator < 0n !== denominator < 0n;
  const magnitude =
    (absolute(numerator) * 2n + absolute(denominator)) / (absolute(denominator) * 2n);
  return isNegative ? -magnitude : magnitude;
}

function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function toExactNumber(value: bigint): number {
  return assertExactInteger(Number(value));
}
