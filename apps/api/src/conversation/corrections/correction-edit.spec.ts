import { transactionCandidate } from '../../ai/testing/fake-ai-provider.fixture.js';
import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { UNSPECIFIED_DATE } from '../../ai/testing/fake-ai-provider.fixture.js';
import type { Transaction } from '../../transactions/transactions.service.js';
import { applyCorrection } from './correction-edit.js';

const EXISTING: Transaction = {
  id: 'transaction',
  householdId: 'household',
  memberId: 'gabriel',
  accountId: 'joint',
  transferAccountId: null,
  type: 'EXPENSE',
  amountMinor: 2275,
  currency: 'EUR',
  merchant: 'Five Guys',
  description: null,
  categoryId: 'restaurants',
  expenseScope: 'HOUSEHOLD',
  transactionDate: '2026-10-06',
  paymentMethod: null,
  source: 'WHATSAPP_TEXT',
  sourceMessageId: 'message',
  aiConfidence: 0.9,
  createdAt: new Date('2026-10-06T10:00:00Z'),
  updatedAt: new Date('2026-10-06T10:00:00Z'),
};

const CONTEXT = {
  accounts: [
    { id: 'joint', name: 'Joint Account', currency: 'EUR', ownerMemberId: null },
    { id: 'inter', name: 'Inter', currency: 'BRL', ownerMemberId: 'gabriel' },
  ],
  categories: [
    { id: 'restaurants', name: 'Restaurantes', kind: 'EXPENSE' as const },
    { id: 'coffee', name: 'Café', kind: 'EXPENSE' as const },
    { id: 'salary', name: 'Salário', kind: 'INCOME' as const },
  ],
  members: [
    { id: 'gabriel', name: 'Gabriel' },
    { id: 'renata', name: 'Renata' },
  ],
  today: '2026-10-06',
};

function changes(overrides: Partial<TransactionCandidate>): TransactionCandidate {
  return {
    ...transactionCandidate(),
    type: null,
    amount: null,
    currency: null,
    merchant: null,
    category: null,
    ...overrides,
  };
}

describe('applyCorrection', () => {
  it('moves the date and keeps everything else', () => {
    expect(
      applyCorrection(
        EXISTING,
        changes({ date: { ...UNSPECIFIED_DATE, kind: 'DAY_OF_MONTH', dayOfMonth: 1 } }),
        CONTEXT,
      ),
    ).toEqual({
      status: 'EDIT',
      edit: {
        type: 'EXPENSE',
        amountMinor: 2275,
        memberId: 'gabriel',
        accountId: 'joint',
        categoryId: 'restaurants',
        merchant: 'Five Guys',
        description: null,
        expenseScope: 'HOUSEHOLD',
        transactionDate: '2026-10-01',
      },
    });
  });

  it('reads a new amount in the currency of the account', () => {
    expect(applyCorrection(EXISTING, changes({ amount: '45' }), CONTEXT)).toMatchObject({
      edit: { amountMinor: 4500 },
    });
  });

  it('changes the category and the member it belongs to', () => {
    expect(
      applyCorrection(EXISTING, changes({ category: 'Café', member: 'Renata' }), CONTEXT),
    ).toMatchObject({ edit: { categoryId: 'coffee', memberId: 'renata' } });
  });

  it('turns an expense into income, leaving a category that no longer fits behind', () => {
    expect(applyCorrection(EXISTING, changes({ type: 'INCOME' }), CONTEXT)).toMatchObject({
      edit: { type: 'INCOME', categoryId: null },
    });
  });

  it.each([
    [{ amount: 'abc' }, 'INVALID_AMOUNT'],
    [{ category: 'Gadgets' }, 'UNKNOWN_CATEGORY'],
    [{ category: 'Salário' }, 'CATEGORY_KIND_MISMATCH'],
    [{ member: 'Zé' }, 'UNKNOWN_MEMBER'],
    [{ account: 'Nubank' }, 'UNKNOWN_ACCOUNT'],
    [{ currency: 'BRL' }, 'CURRENCY_MISMATCH'],
    [
      { date: { ...UNSPECIFIED_DATE, kind: 'EXPLICIT_DATE' as const, isoDate: '2026-12-20' } },
      'FUTURE_DATE',
    ],
  ])('refuses %j', (change, reason) => {
    expect(applyCorrection(EXISTING, changes(change), CONTEXT)).toEqual({
      status: 'REJECTED',
      reasons: [reason],
    });
  });

  it('says when nothing would change', () => {
    expect(applyCorrection(EXISTING, changes({ merchant: 'Five Guys' }), CONTEXT)).toEqual({
      status: 'UNCHANGED',
    });
  });
});
