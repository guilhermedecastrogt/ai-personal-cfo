import { UNSPECIFIED_PERIOD } from '../ai/testing/fake-ai-provider.fixture.js';
import { CONVERSATION_POLICY } from './conversation-policy.js';
import { EMPTY_CONVERSATION_STATE, readConversationState } from './conversation-state.js';

const STORED_AT = new Date('2026-10-20T12:00:00Z');

const STATE = {
  lastOutcome: 'QUESTION_ANSWERED',
  question: {
    intent: 'SPENDING_BY_CATEGORY',
    period: UNSPECIFIED_PERIOD,
    category: 'Food',
    account: null,
    memberScope: 'HOUSEHOLD',
    memberName: null,
  },
  pendingTransaction: null,
};

function read(stored: unknown, minutesLater: number, storedAt: Date | null = STORED_AT): unknown {
  return readConversationState(
    stored,
    storedAt,
    new Date(STORED_AT.getTime() + minutesLater * 60_000),
    CONVERSATION_POLICY.stateLifetimeInMinutes,
  );
}

describe('readConversationState', () => {
  it('returns the stored state while it is fresh', () => {
    expect(read(STATE, 5)).toEqual(STATE);
    expect(read(STATE, 30)).toEqual(STATE);
  });

  it('forgets the state once it is older than its lifetime', () => {
    expect(read(STATE, 31)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it('is empty for a conversation that never stored one', () => {
    expect(read({}, 0, null)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it('keeps a state saved by a message received a moment later but handled first', () => {
    expect(read(STATE, -0.5)).toEqual(STATE);
  });

  it('ignores a state dated in the future', () => {
    expect(read(STATE, -5)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it.each([
    ['an unknown intent', { ...STATE, question: { ...STATE.question, intent: 'RUN_SQL' } }],
    ['a missing field', { lastOutcome: 'QUESTION_ANSWERED' }],
    ['a pending transaction of the wrong shape', { ...STATE, pendingTransaction: { amount: 30 } }],
    ['text', 'state'],
  ])('discards stored state with %s instead of trusting it', (_description, stored) => {
    expect(read(stored, 1)).toEqual(EMPTY_CONVERSATION_STATE);
  });

  it('drops properties the state does not define, such as identifiers and totals', () => {
    const tampered = {
      ...STATE,
      householdId: 'another-household',
      question: { ...STATE.question, accountId: 'account-1', totalMinor: 80000 },
    };

    expect(JSON.stringify(read(tampered, 1))).not.toMatch(/another-household|account-1|80000/);
  });

  it('bounds what a conversation can hold', () => {
    expect(CONVERSATION_POLICY).toEqual({
      recentUserMessages: 3,
      maximumMessageLength: 1000,
      retainedMessages: 20,
      stateLifetimeInMinutes: 30,
    });
  });
});
