import { assertSameCurrency } from '../../../money/money-math.js';
import { contains, type DateRange, type IsoDate } from '../period/period.js';

export type FlowType = 'EXPENSE' | 'INCOME';

export interface LedgerEntry {
  readonly id: string;
  readonly type: FlowType | 'TRANSFER';
  readonly amountMinor: number;
  readonly currency: string;
  readonly date: IsoDate;
  readonly memberId: string;
  readonly accountId: string;
  readonly transferAccountId: string | null;
  readonly categoryId: string | null;
  readonly merchant: string | null;
}

export function flowsOf(
  entries: readonly LedgerEntry[],
  type: FlowType,
  currency: string,
): LedgerEntry[] {
  for (const entry of entries) {
    assertSameCurrency(currency, entry.currency);
  }
  return entries.filter((entry) => entry.type === type);
}

export function within(entries: readonly LedgerEntry[], range: DateRange): LedgerEntry[] {
  return entries.filter((entry) => contains(range, entry.date));
}

export function amountsOf(entries: readonly LedgerEntry[]): number[] {
  return entries.map((entry) => entry.amountMinor);
}
