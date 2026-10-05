import { flowsOf, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { IsoDate } from '../period/period.js';

export interface ExpenseItem {
  readonly transactionId: string;
  readonly date: IsoDate;
  readonly amountMinor: number;
  readonly merchant: string | null;
  readonly categoryId: string | null;
  readonly memberId: string;
  readonly accountId: string;
}

export function selectLargestExpenses(
  entries: readonly LedgerEntry[],
  currency: string,
  limit: number,
): ExpenseItem[] {
  return flowsOf(entries, 'EXPENSE', currency)
    .sort(
      (left, right) =>
        right.amountMinor - left.amountMinor ||
        right.date.localeCompare(left.date) ||
        left.id.localeCompare(right.id),
    )
    .slice(0, Math.max(limit, 0))
    .map((entry) => ({
      transactionId: entry.id,
      date: entry.date,
      amountMinor: entry.amountMinor,
      merchant: entry.merchant,
      categoryId: entry.categoryId,
      memberId: entry.memberId,
      accountId: entry.accountId,
    }));
}
