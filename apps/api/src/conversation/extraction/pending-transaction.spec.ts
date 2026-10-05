import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { UNSPECIFIED_DATE } from '../../ai/testing/fake-ai-provider.fixture.js';
import { completePendingCandidate } from './pending-transaction.js';

const EMPTY: TransactionCandidate = {
  type: null,
  amount: null,
  currency: null,
  merchant: null,
  description: null,
  category: null,
  account: null,
  transferAccount: null,
  paymentMethod: null,
  date: UNSPECIFIED_DATE,
  confidence: 0.95,
};

const PENDING: TransactionCandidate = {
  ...EMPTY,
  type: 'EXPENSE',
  amount: '30',
  currency: 'EUR',
  date: { ...UNSPECIFIED_DATE, kind: 'YESTERDAY' },
  confidence: 0.9,
};

describe('completePendingCandidate', () => {
  it('adds what the new message states and keeps everything else', () => {
    expect(completePendingCandidate(PENDING, { ...EMPTY, category: 'Restaurants' })).toEqual({
      ...PENDING,
      category: 'Restaurants',
      confidence: 0.95,
    });
  });

  it('keeps the pending amount when the new message states none', () => {
    expect(completePendingCandidate(PENDING, { ...EMPTY, merchant: 'Bistro' }).amount).toBe('30');
  });

  it('lets the new message replace a field it states', () => {
    const completed = completePendingCandidate(PENDING, {
      ...EMPTY,
      amount: '32',
      date: { ...UNSPECIFIED_DATE, kind: 'TODAY' },
    });

    expect(completed).toMatchObject({ amount: '32', date: { kind: 'TODAY' } });
  });

  it('ignores blank text in the new message', () => {
    expect(
      completePendingCandidate(PENDING, { ...EMPTY, amount: '  ', currency: '' }),
    ).toMatchObject({
      amount: '30',
      currency: 'EUR',
    });
  });

  it('takes the confidence of the completing message', () => {
    expect(completePendingCandidate(PENDING, { ...EMPTY, confidence: 0.4 }).confidence).toBe(0.4);
  });
});
