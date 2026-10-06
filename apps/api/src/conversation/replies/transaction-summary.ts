import type { HouseholdDirectory } from '../../directory/household-directory.service.js';
import { formatMoney } from '../../money/format-money.js';
import type { Transaction } from '../../transactions/transactions.service.js';

export interface TransactionSummary {
  readonly type: Transaction['type'];
  readonly amount: string;
  readonly merchant: string | null;
  readonly category: string | null;
  readonly account: string | null;
  readonly transferTo: string | null;
  readonly date: string;
  readonly forMember: string | null;
}

export function summarizeTransaction(
  transaction: Transaction,
  directory: HouseholdDirectory,
  senderId: string,
): TransactionSummary {
  const nameIn = (
    entries: readonly { readonly id: string; readonly name: string }[],
    id: string | null,
  ): string | null =>
    id === null ? null : (entries.find((entry) => entry.id === id)?.name ?? null);
  return {
    type: transaction.type,
    amount: formatMoney(transaction.amountMinor, transaction.currency, directory.locale),
    merchant: transaction.merchant,
    category: nameIn(directory.categories, transaction.categoryId),
    account: nameIn(directory.accounts, transaction.accountId),
    transferTo: nameIn(directory.accounts, transaction.transferAccountId),
    date: transaction.transactionDate,
    forMember:
      transaction.memberId === senderId ? null : nameIn(directory.members, transaction.memberId),
  };
}
