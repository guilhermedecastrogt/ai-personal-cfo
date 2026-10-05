export function householdCurrencies(
  householdCurrency: string | undefined,
  accounts: readonly { readonly currency: string }[],
): string[] {
  const accountCurrencies = [...new Set(accounts.map((account) => account.currency))].sort();
  return householdCurrency === undefined
    ? accountCurrencies
    : [...new Set([householdCurrency, ...accountCurrencies])];
}
