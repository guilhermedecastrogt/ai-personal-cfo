import { describeResult, type NameDirectory } from './result-description.js';

const DIRECTORY: NameDirectory = {
  members: new Map([
    ['m1', 'Member A'],
    ['m2', 'Member B'],
  ]),
  categories: new Map([['c1', 'Restaurants']]),
  accounts: new Map([['a1', 'Joint Account']]),
  goals: new Map([['g1', 'Summer Trip']]),
};

describe('describeResult', () => {
  it('replaces identifiers with names and formats amounts and ratios', () => {
    const described = describeResult(
      {
        currency: 'EUR',
        totalMinor: 30000,
        categoryId: 'c1',
        shareBasisPoints: 4286,
        byMember: [
          { memberId: 'm1', totalMinor: 18000, shareBasisPoints: 6000 },
          { memberId: 'm2', totalMinor: 12000, shareBasisPoints: 4000 },
        ],
      },
      DIRECTORY,
    );

    expect(described).toEqual({
      currency: 'EUR',
      total: '€300.00',
      category: 'Restaurants',
      share: '42.86%',
      byMember: [
        { member: 'Member A', total: '€180.00', share: '60%' },
        { member: 'Member B', total: '€120.00', share: '40%' },
      ],
    });
  });

  it('leaves no identifier and no raw minor amount in the description', () => {
    const described = JSON.stringify(
      describeResult(
        {
          currency: 'EUR',
          budgetId: 'b1',
          transactionId: 't1',
          goalId: 'g1',
          accountId: 'a1',
          ownerMemberId: null,
          memberIds: ['m1', 'm2'],
          spentMinor: 24600,
        },
        DIRECTORY,
      ),
    );

    expect(described).toBe(
      JSON.stringify({
        currency: 'EUR',
        goal: 'Summer Trip',
        account: 'Joint Account',
        owner: 'Joint',
        members: ['Member A', 'Member B'],
        spent: '€246.00',
      }),
    );
  });

  it('uses the currency of the nearest enclosing object', () => {
    const described = describeResult(
      {
        totals: [
          { currency: 'BRL', totalMinor: 5000 },
          { currency: 'JPY', totalMinor: 1500 },
        ],
      },
      DIRECTORY,
    );

    expect(described).toEqual({
      totals: [
        { currency: 'BRL', total: 'R$50.00' },
        { currency: 'JPY', total: '¥1,500' },
      ],
    });
  });

  it('keeps an absent ratio absent and names missing references plainly', () => {
    expect(
      describeResult(
        { currency: 'EUR', savingsRateBasisPoints: null, categoryId: null, memberId: 'gone' },
        DIRECTORY,
      ),
    ).toEqual({ currency: 'EUR', savingsRate: null, category: 'Uncategorised', member: 'Unknown' });
  });

  it('formats lists of amounts and passes other values through', () => {
    expect(
      describeResult(
        { currency: 'EUR', amountsMinor: [1799, 1799], status: 'NEAR_LIMIT', daysRemaining: 11 },
        DIRECTORY,
      ),
    ).toEqual({
      currency: 'EUR',
      amounts: ['€17.99', '€17.99'],
      status: 'NEAR_LIMIT',
      daysRemaining: 11,
    });
  });
});
