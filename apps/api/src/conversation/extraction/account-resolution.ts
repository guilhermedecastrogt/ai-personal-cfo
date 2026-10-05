export interface AccountOption {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly ownerMemberId: string | null;
}

export type AccountResolution<Account extends AccountOption> =
  | { readonly status: 'RESOLVED'; readonly account: Account }
  | { readonly status: 'UNKNOWN' }
  | { readonly status: 'AMBIGUOUS' };

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function resolveMentionedAccount<Account extends AccountOption>(
  mention: string,
  accounts: readonly Account[],
  senderId: string,
): AccountResolution<Account> {
  const wanted = normalizeName(mention);
  if (wanted === '') {
    return { status: 'UNKNOWN' };
  }
  const exact = accounts.filter((account) => normalizeName(account.name) === wanted);
  const partial = accounts.filter((account) => normalizeName(account.name).includes(wanted));
  const matches = exact.length > 0 ? exact : partial;
  return (
    pickOne(matches) ??
    pickOne(matches.filter((match) => match.ownerMemberId === senderId)) ?? {
      status: matches.length === 0 ? 'UNKNOWN' : 'AMBIGUOUS',
    }
  );
}

export function resolveUnmentionedAccount<Account extends AccountOption>(
  accounts: readonly Account[],
  defaultAccount: Account | undefined,
): AccountResolution<Account> {
  if (defaultAccount !== undefined) {
    return { status: 'RESOLVED', account: defaultAccount };
  }
  return pickOne(accounts) ?? { status: accounts.length === 0 ? 'UNKNOWN' : 'AMBIGUOUS' };
}

function pickOne<Account extends AccountOption>(
  candidates: readonly Account[],
): AccountResolution<Account> | undefined {
  const [only, ...others] = candidates;
  return only !== undefined && others.length === 0
    ? { status: 'RESOLVED', account: only }
    : undefined;
}
