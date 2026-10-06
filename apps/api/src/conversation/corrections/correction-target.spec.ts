import type { CorrectionTarget } from '../../ai/interpretation/message-interpretation.schema.js';
import { UNSPECIFIED_DATE } from '../../ai/testing/fake-ai-provider.fixture.js';
import type { Transaction } from '../../transactions/transactions.service.js';
import { resolveCorrectionTarget } from './correction-target.js';

let sequence = 0;

function row(overrides: Partial<Transaction>): Transaction {
  sequence += 1;
  return {
    id: `transaction-${String(sequence)}`,
    householdId: 'household',
    memberId: 'gabriel',
    accountId: 'joint',
    transferAccountId: null,
    type: 'EXPENSE',
    amountMinor: 1000,
    currency: 'EUR',
    merchant: null,
    description: null,
    categoryId: null,
    expenseScope: 'HOUSEHOLD',
    transactionDate: '2026-10-05',
    paymentMethod: null,
    source: 'WHATSAPP_TEXT',
    sourceMessageId: 'older',
    aiConfidence: 0.9,
    createdAt: new Date(Date.UTC(2026, 9, 5, 12, 0, sequence)),
    updatedAt: new Date(Date.UTC(2026, 9, 5, 12, 0, sequence)),
    ...overrides,
  };
}

const CONTEXT = {
  members: [
    { id: 'gabriel', name: 'Gabriel' },
    { id: 'renata', name: 'Renata' },
  ],
  categoryNames: new Map([['groceries', 'Mercado']]),
  today: '2026-10-06',
};

function target(overrides: Partial<CorrectionTarget> = {}): CorrectionTarget {
  return {
    ordinal: null,
    merchant: null,
    amount: null,
    member: null,
    date: UNSPECIFIED_DATE,
    ...overrides,
  };
}

const OLDER = row({ merchant: 'Five Guys', amountMinor: 2275, transactionDate: '2026-10-01' });
const FIRST = row({ merchant: 'Café Central', amountMinor: 1065, sourceMessageId: 'latest' });
const SECOND = row({
  merchant: 'Tesco',
  amountMinor: 11772,
  categoryId: 'groceries',
  sourceMessageId: 'latest',
});
const RECENT = [SECOND, FIRST, OLDER];

describe('resolveCorrectionTarget', () => {
  it('takes "isso" as the only transaction of the latest message', () => {
    expect(resolveCorrectionTarget([OLDER], target(), CONTEXT)).toEqual({
      status: 'RESOLVED',
      transaction: OLDER,
    });
  });

  it('asks which one when the latest message recorded several', () => {
    expect(resolveCorrectionTarget(RECENT, target(), CONTEXT)).toEqual({
      status: 'AMBIGUOUS',
      transactions: [FIRST, SECOND],
    });
  });

  it('reads an ordinal only within the latest message, in the order written', () => {
    expect(resolveCorrectionTarget(RECENT, target({ ordinal: 2 }), CONTEXT)).toEqual({
      status: 'RESOLVED',
      transaction: SECOND,
    });
    expect(resolveCorrectionTarget(RECENT, target({ ordinal: 3 }), CONTEXT)).toEqual({
      status: 'NOT_FOUND',
    });
  });

  it('finds a merchant or a category, in the latest message first', () => {
    expect(resolveCorrectionTarget(RECENT, target({ merchant: 'mercado' }), CONTEXT)).toEqual({
      status: 'RESOLVED',
      transaction: SECOND,
    });
    expect(resolveCorrectionTarget(RECENT, target({ merchant: 'five guys' }), CONTEXT)).toEqual({
      status: 'RESOLVED',
      transaction: OLDER,
    });
  });

  it('finds an amount and a date', () => {
    expect(resolveCorrectionTarget(RECENT, target({ amount: '10,65' }), CONTEXT)).toMatchObject({
      transaction: FIRST,
    });
    expect(
      resolveCorrectionTarget(
        RECENT,
        target({ date: { ...UNSPECIFIED_DATE, kind: 'DAY_OF_MONTH', dayOfMonth: 1 } }),
        CONTEXT,
      ),
    ).toMatchObject({ transaction: OLDER });
  });

  it('finds nothing when nothing fits or nothing was recorded', () => {
    expect(resolveCorrectionTarget(RECENT, target({ merchant: 'Uber' }), CONTEXT)).toEqual({
      status: 'NOT_FOUND',
    });
    expect(resolveCorrectionTarget([], target(), CONTEXT)).toEqual({ status: 'NOT_FOUND' });
  });
});
