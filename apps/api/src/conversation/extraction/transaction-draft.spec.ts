import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { UNSPECIFIED_DATE } from '../../ai/testing/fake-ai-provider.fixture.js';
import { draftTransaction, presentMerchant, type DraftingContext } from './transaction-draft.js';

const CURRENT = { id: 'current', name: 'Current', currency: 'EUR', ownerMemberId: 'sender' };
const SAVINGS = { id: 'savings', name: 'Savings', currency: 'EUR', ownerMemberId: null };
const REAIS = { id: 'reais', name: 'Reais', currency: 'BRL', ownerMemberId: 'sender' };
const YEN = { id: 'yen', name: 'Yen', currency: 'JPY', ownerMemberId: 'sender' };

const CONTEXT: DraftingContext = {
  senderId: 'sender',
  today: '2026-10-20',
  accounts: [CURRENT, SAVINGS, REAIS, YEN],
  defaultAccount: CURRENT,
  categories: [
    { id: 'groceries', name: 'Groceries', kind: 'EXPENSE' },
    { id: 'restaurants', name: 'Restaurants', kind: 'EXPENSE' },
    { id: 'salary', name: 'Salary', kind: 'INCOME' },
  ],
  confidenceThreshold: 0.8,
};

function candidate(overrides: Partial<TransactionCandidate> = {}): TransactionCandidate {
  return {
    type: 'EXPENSE',
    amount: '23',
    currency: 'EUR',
    merchant: 'Lidl',
    description: null,
    category: 'Groceries',
    account: null,
    transferAccount: null,
    member: null,
    memberReference: 'SENDER',
    paymentMethod: null,
    date: UNSPECIFIED_DATE,
    confidence: 0.98,
    ...overrides,
  };
}

function draft(
  overrides: Partial<TransactionCandidate> = {},
  context: Partial<DraftingContext> = {},
): ReturnType<typeof draftTransaction> {
  return draftTransaction(candidate(overrides), { ...CONTEXT, ...context });
}

describe('presentMerchant', () => {
  it.each([
    ['five guys', 'Five Guys'],
    ['casa do pão', 'Casa do Pão'],
    ['SHEIN', 'SHEIN'],
    ["McDonald's", "McDonald's"],
  ])('writes %j as %j', (merchant, expected) => {
    expect(presentMerchant(merchant)).toBe(expected);
  });
});

describe('draftTransaction', () => {
  it('turns a complete candidate into transaction fields', () => {
    expect(draft()).toEqual({
      problems: [],
      understood: expect.objectContaining({ amountMinor: 2300, currency: 'EUR' }) as unknown,
      fields: {
        type: 'EXPENSE',
        amountMinor: 2300,
        currency: 'EUR',
        accountId: 'current',
        categoryId: 'groceries',
        merchant: 'Lidl',
        transactionDate: '2026-10-20',
        aiConfidence: 0.98,
      },
    });
  });

  describe('amount', () => {
    it.each([
      ['23', 2300],
      ['23.5', 2350],
      ['23.50', 2350],
      ['1200', 120000],
      ['0.01', 1],
      ['19.99', 1999],
    ])('converts %s to %d minor units exactly', (amount, amountMinor) => {
      expect(draft({ amount }).fields?.amountMinor).toBe(amountMinor);
    });

    it('uses the minor unit of the currency', () => {
      expect(draft({ amount: '1500', currency: 'JPY', account: 'Yen' }).fields?.amountMinor).toBe(
        1500,
      );
    });

    it('asks when the amount is missing', () => {
      expect(draft({ amount: null })).toMatchObject({
        problems: ['MISSING_AMOUNT'],
        fields: undefined,
      });
      expect(draft({ amount: '  ' }).problems).toEqual(['MISSING_AMOUNT']);
    });

    it.each(['0', '23,50', '23.999', '-5', 'twenty', '1e3', '€23'])(
      'asks when the amount is %s',
      (amount) => {
        expect(draft({ amount })).toMatchObject({
          problems: ['INVALID_AMOUNT'],
          fields: undefined,
        });
      },
    );
  });

  describe('currency', () => {
    it('takes the currency of the account when none was stated', () => {
      expect(draft({ currency: null }).fields).toMatchObject({
        currency: 'EUR',
        amountMinor: 2300,
      });
    });

    it('accepts a stated currency that matches the account', () => {
      expect(draft({ currency: 'brl', account: 'Reais' }).fields).toMatchObject({
        currency: 'BRL',
        accountId: 'reais',
      });
    });

    it('records in the only account that holds the stated currency when none was named', () => {
      expect(draft({ currency: 'BRL', amount: '1200' }).fields).toMatchObject({
        currency: 'BRL',
        accountId: 'reais',
        amountMinor: 120000,
      });
    });

    it('asks instead of converting when the stated currency differs from the account', () => {
      expect(draft({ currency: 'GBP' })).toMatchObject({
        problems: ['CURRENCY_MISMATCH'],
        fields: undefined,
      });
    });

    it('asks when the stated currency is not a real currency', () => {
      expect(draft({ currency: 'EURO' }).problems).toEqual(['UNSUPPORTED_CURRENCY']);
    });
  });

  describe('category', () => {
    it('matches an existing category regardless of case', () => {
      expect(draft({ category: 'groceries' }).fields?.categoryId).toBe('groceries');
    });

    it('asks when an expense has no category', () => {
      expect(draft({ category: null })).toMatchObject({
        problems: ['MISSING_CATEGORY'],
        fields: undefined,
      });
    });

    it('asks when the category does not exist and never creates it', () => {
      expect(draft({ category: 'Gadgets' })).toMatchObject({
        problems: ['UNKNOWN_CATEGORY'],
        understood: { category: undefined },
        fields: undefined,
      });
    });

    it('asks when the category is of the wrong kind for the transaction', () => {
      expect(draft({ category: 'Salary' }).problems).toEqual(['CATEGORY_KIND_MISMATCH']);
      expect(draft({ type: 'INCOME', category: 'Groceries' }).problems).toEqual([
        'CATEGORY_KIND_MISMATCH',
      ]);
    });

    it('accepts income with or without a category', () => {
      expect(draft({ type: 'INCOME', category: 'Salary' }).fields?.categoryId).toBe('salary');
      expect(draft({ type: 'INCOME', category: null })).toMatchObject({ problems: [] });
    });
  });

  describe('merchant and description', () => {
    it('records no merchant when none was stated', () => {
      const result = draft({ merchant: null });

      expect(result.problems).toEqual([]);
      expect(Object.keys(result.fields ?? {})).not.toContain('merchant');
    });

    it('treats a blank merchant as not stated', () => {
      expect(Object.keys(draft({ merchant: '   ' }).fields ?? {})).not.toContain('merchant');
    });

    it('keeps a stated description and payment method', () => {
      expect(
        draft({ description: 'weekly shop', paymentMethod: 'DEBIT_CARD' }).fields,
      ).toMatchObject({
        description: 'weekly shop',
        paymentMethod: 'DEBIT_CARD',
      });
    });
  });

  describe('account', () => {
    it('uses the default account of the sender when none was mentioned', () => {
      expect(draft().fields?.accountId).toBe('current');
    });

    it('uses a mentioned account', () => {
      expect(draft({ account: 'savings' }).fields?.accountId).toBe('savings');
    });

    it('asks when no account was mentioned and there is no default to fall back on', () => {
      expect(draft({}, { defaultAccount: undefined })).toMatchObject({
        problems: ['AMBIGUOUS_ACCOUNT'],
        fields: undefined,
      });
    });

    it('asks when the mentioned account does not exist', () => {
      expect(draft({ account: 'Offshore' }).problems).toEqual(['UNKNOWN_ACCOUNT']);
    });
  });

  describe('transfers', () => {
    it('moves money between two named accounts without a category', () => {
      const result = draft({
        type: 'TRANSFER',
        category: null,
        merchant: null,
        transferAccount: 'Savings',
      });

      expect(result.problems).toEqual([]);
      expect(result.fields).toMatchObject({
        type: 'TRANSFER',
        accountId: 'current',
        transferAccountId: 'savings',
      });
      expect(Object.keys(result.fields ?? {})).not.toContain('categoryId');
    });

    it('drops a category the model attached to a transfer', () => {
      const result = draft({ type: 'TRANSFER', transferAccount: 'Savings', category: 'Groceries' });

      expect(Object.keys(result.fields ?? {})).not.toContain('categoryId');
    });

    it('asks for the destination when it was not stated or does not exist', () => {
      expect(draft({ type: 'TRANSFER', category: null }).problems).toEqual([
        'MISSING_TRANSFER_ACCOUNT',
      ]);
      expect(
        draft({ type: 'TRANSFER', category: null, transferAccount: 'Offshore' }).problems,
      ).toEqual(['UNKNOWN_TRANSFER_ACCOUNT']);
    });
  });

  describe('date', () => {
    it('resolves relative dates against the reference date', () => {
      const yesterday = { ...UNSPECIFIED_DATE, kind: 'YESTERDAY' as const };

      expect(draft({ date: yesterday }).fields?.transactionDate).toBe('2026-10-19');
    });

    it('asks when the date cannot be resolved', () => {
      const broken = { ...UNSPECIFIED_DATE, kind: 'EXPLICIT_DATE' as const, isoDate: 'soon' };

      expect(draft({ date: broken }).problems).toEqual(['UNRESOLVABLE_DATE']);
    });

    it('asks when the date is in the future', () => {
      const future = { ...UNSPECIFIED_DATE, kind: 'EXPLICIT_DATE' as const, isoDate: '2026-10-21' };

      expect(draft({ date: future }).problems).toEqual(['FUTURE_DATE']);
    });
  });

  describe('confidence', () => {
    it('asks for confirmation below the threshold', () => {
      expect(draft({ confidence: 0.79 })).toMatchObject({
        problems: ['LOW_CONFIDENCE'],
        fields: undefined,
      });
    });

    it('accepts exactly the threshold', () => {
      expect(draft({ confidence: 0.8 }).problems).toEqual([]);
    });

    it('never lets high confidence override a failed check', () => {
      expect(draft({ confidence: 1, amount: null, category: 'Gadgets' })).toMatchObject({
        problems: ['MISSING_AMOUNT', 'UNKNOWN_CATEGORY'],
        fields: undefined,
      });
    });
  });

  it('asks for the type when the message did not make it clear', () => {
    expect(draft({ type: null }).problems).toContain('MISSING_TYPE');
  });

  it('reports every problem at once', () => {
    const result = draft(
      { type: null, amount: null, category: 'Gadgets', confidence: 0.2 },
      { defaultAccount: undefined },
    );

    expect(result.problems).toEqual([
      'MISSING_TYPE',
      'AMBIGUOUS_ACCOUNT',
      'MISSING_AMOUNT',
      'UNKNOWN_CATEGORY',
      'LOW_CONFIDENCE',
    ]);
  });
});
