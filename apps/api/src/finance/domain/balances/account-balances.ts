import { assertSameCurrency, sumMinor } from '../../../money/money-math.js';
import type { LedgerEntry } from '../ledger/ledger-entry.js';

export interface AccountDefinition {
  readonly id: string;
  readonly currency: string;
  readonly ownerMemberId: string | null;
  readonly openingBalanceMinor: number;
}

export interface AccountBalance {
  readonly accountId: string;
  readonly currency: string;
  readonly ownerMemberId: string | null;
  readonly balanceMinor: number;
}

export interface CurrencyBalances {
  readonly currency: string;
  readonly totalMinor: number;
  readonly jointMinor: number;
  readonly byMember: readonly { readonly memberId: string; readonly totalMinor: number }[];
}

export function calculateAccountBalances(
  accounts: readonly AccountDefinition[],
  entries: readonly LedgerEntry[],
): AccountBalance[] {
  const movements = new Map<string, number[]>(accounts.map((account) => [account.id, []]));
  const currencies = new Map(accounts.map((account) => [account.id, account.currency]));
  const record = (accountId: string, entry: LedgerEntry, signedAmountMinor: number): void => {
    const currency = currencies.get(accountId);
    if (currency !== undefined) {
      assertSameCurrency(currency, entry.currency);
      movements.get(accountId)?.push(signedAmountMinor);
    }
  };
  for (const entry of entries) {
    record(
      entry.accountId,
      entry,
      entry.type === 'INCOME' ? entry.amountMinor : -entry.amountMinor,
    );
    if (entry.type === 'TRANSFER' && entry.transferAccountId !== null) {
      record(entry.transferAccountId, entry, entry.amountMinor);
    }
  }
  return accounts.map((account) => ({
    accountId: account.id,
    currency: account.currency,
    ownerMemberId: account.ownerMemberId,
    balanceMinor: sumMinor([account.openingBalanceMinor, ...(movements.get(account.id) ?? [])]),
  }));
}

export function summarizeBalances(
  balances: readonly AccountBalance[],
  memberIds: readonly string[] = [],
): CurrencyBalances[] {
  const currencies = [...new Set(balances.map((balance) => balance.currency))].sort();
  return currencies.map((currency) => {
    const inCurrency = balances.filter((balance) => balance.currency === currency);
    const owners = new Set([
      ...memberIds,
      ...inCurrency.map((balance) => balance.ownerMemberId).filter((owner) => owner !== null),
    ]);
    const totalOwnedBy = (ownerMemberId: string | null): number =>
      sumMinor(
        inCurrency
          .filter((balance) => balance.ownerMemberId === ownerMemberId)
          .map((balance) => balance.balanceMinor),
      );
    return {
      currency,
      totalMinor: sumMinor(inCurrency.map((balance) => balance.balanceMinor)),
      jointMinor: totalOwnedBy(null),
      byMember: [...owners].sort().map((memberId) => ({
        memberId,
        totalMinor: totalOwnedBy(memberId),
      })),
    };
  });
}
