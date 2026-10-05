import { MixedCurrencyError } from '../../../money/money-math.js';
import { expense, income, transfer } from '../ledger/ledger-entry.fixture.js';
import {
  calculateAccountBalances,
  summarizeBalances,
  type AccountDefinition,
} from './account-balances.js';

const ACCOUNTS: AccountDefinition[] = [
  { id: 'current-a', currency: 'EUR', ownerMemberId: 'member-a', openingBalanceMinor: 100000 },
  { id: 'current-b', currency: 'EUR', ownerMemberId: 'member-b', openingBalanceMinor: 50000 },
  { id: 'joint', currency: 'EUR', ownerMemberId: null, openingBalanceMinor: 200000 },
  { id: 'reais', currency: 'BRL', ownerMemberId: 'member-a', openingBalanceMinor: 30000 },
];

function balanceOf(
  accountId: string,
  balances: ReturnType<typeof calculateAccountBalances>,
): number {
  return balances.find((balance) => balance.accountId === accountId)?.balanceMinor ?? Number.NaN;
}

describe('calculateAccountBalances', () => {
  it('starts from the opening balance', () => {
    const balances = calculateAccountBalances(ACCOUNTS, []);

    expect(balances.map((balance) => balance.balanceMinor)).toEqual([100000, 50000, 200000, 30000]);
  });

  it('adds income and subtracts expenses', () => {
    const balances = calculateAccountBalances(ACCOUNTS, [
      income(210000, { accountId: 'current-a' }),
      expense(4327, { accountId: 'current-a' }),
    ]);

    expect(balanceOf('current-a', balances)).toBe(305673);
  });

  it('moves a transfer from the source to the destination without changing the total', () => {
    const before = calculateAccountBalances(ACCOUNTS, []);
    const after = calculateAccountBalances(ACCOUNTS, [
      transfer(50000, { accountId: 'current-a', transferAccountId: 'joint' }),
    ]);
    const total = (balances: typeof before): number =>
      summarizeBalances(balances).find((totals) => totals.currency === 'EUR')?.totalMinor ?? 0;

    expect(balanceOf('current-a', after)).toBe(50000);
    expect(balanceOf('joint', after)).toBe(250000);
    expect(total(after)).toBe(total(before));
  });

  it('allows a balance to go negative', () => {
    const balances = calculateAccountBalances(ACCOUNTS, [
      expense(60000, { accountId: 'current-b' }),
    ]);

    expect(balanceOf('current-b', balances)).toBe(-10000);
  });

  it('fails when an entry is not in the currency of its account', () => {
    expect(() =>
      calculateAccountBalances(ACCOUNTS, [expense(1000, { accountId: 'reais', currency: 'EUR' })]),
    ).toThrow(MixedCurrencyError);
  });
});

describe('summarizeBalances', () => {
  it('separates member, joint and total balances per currency for any number of members', () => {
    const totals = summarizeBalances(calculateAccountBalances(ACCOUNTS, []), [
      'member-a',
      'member-b',
      'member-c',
    ]);

    expect(totals).toEqual([
      {
        currency: 'BRL',
        totalMinor: 30000,
        jointMinor: 0,
        byMember: [
          { memberId: 'member-a', totalMinor: 30000 },
          { memberId: 'member-b', totalMinor: 0 },
          { memberId: 'member-c', totalMinor: 0 },
        ],
      },
      {
        currency: 'EUR',
        totalMinor: 350000,
        jointMinor: 200000,
        byMember: [
          { memberId: 'member-a', totalMinor: 100000 },
          { memberId: 'member-b', totalMinor: 50000 },
          { memberId: 'member-c', totalMinor: 0 },
        ],
      },
    ]);
  });
});
