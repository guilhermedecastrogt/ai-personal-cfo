import type { FinancialQuestion } from '../../ai/interpretation/message-interpretation.schema.js';
import { UNSPECIFIED_PERIOD } from '../../ai/testing/fake-ai-provider.fixture.js';
import type { QuestionFrame } from '../conversation-state.js';
import { resolveFollowUp } from './question-resolution.js';

const CURRENT_MONTH = { ...UNSPECIFIED_PERIOD, kind: 'CURRENT_MONTH' as const };
const PREVIOUS_MONTH = { ...UNSPECIFIED_PERIOD, kind: 'PREVIOUS_MONTH' as const };

const FOOD_THIS_MONTH: QuestionFrame = {
  intent: 'SPENDING_BY_CATEGORY',
  period: CURRENT_MONTH,
  category: 'Food',
  account: null,
  memberScope: 'HOUSEHOLD',
  memberName: null,
};

function question(overrides: Partial<FinancialQuestion> = {}): FinancialQuestion {
  return {
    intent: 'SPENDING_TOTAL',
    period: UNSPECIFIED_PERIOD,
    category: null,
    account: null,
    memberScope: 'HOUSEHOLD',
    memberName: null,
    inheritFromPrevious: [],
    ...overrides,
  };
}

describe('resolveFollowUp', () => {
  it('leaves a question that stands on its own untouched', () => {
    const resolved = resolveFollowUp(
      question({ intent: 'SAVINGS', period: PREVIOUS_MONTH }),
      FOOD_THIS_MONTH,
    );

    expect(resolved).toEqual({
      problems: [],
      question: {
        intent: 'SAVINGS',
        period: PREVIOUS_MONTH,
        category: null,
        account: null,
        memberScope: 'HOUSEHOLD',
        memberName: null,
      },
    });
  });

  it('changes the period and keeps the rest for "and last month?"', () => {
    const resolved = resolveFollowUp(
      question({
        period: PREVIOUS_MONTH,
        inheritFromPrevious: ['INTENT', 'CATEGORY', 'ACCOUNT', 'MEMBER'],
      }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toEqual({ ...FOOD_THIS_MONTH, period: PREVIOUS_MONTH });
  });

  it('changes the category and keeps the rest for "only restaurants"', () => {
    const resolved = resolveFollowUp(
      question({ category: 'Restaurants', inheritFromPrevious: ['INTENT', 'PERIOD', 'CATEGORY'] }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toEqual({ ...FOOD_THIS_MONTH, category: 'Restaurants' });
  });

  it('adds a member and keeps the rest for "what about that member?"', () => {
    const resolved = resolveFollowUp(
      question({
        memberScope: 'NAMED_MEMBER',
        memberName: 'Member B',
        inheritFromPrevious: ['INTENT', 'PERIOD', 'CATEGORY', 'MEMBER'],
      }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toEqual({
      ...FOOD_THIS_MONTH,
      memberScope: 'NAMED_MEMBER',
      memberName: 'Member B',
    });
  });

  it('adds an account and keeps the rest for "what about the joint account?"', () => {
    const resolved = resolveFollowUp(
      question({ account: 'joint', inheritFromPrevious: ['INTENT', 'PERIOD', 'CATEGORY'] }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toEqual({ ...FOOD_THIS_MONTH, account: 'joint' });
  });

  it('takes a new intent and keeps the subject for "why?"', () => {
    const resolved = resolveFollowUp(
      question({ intent: 'SPENDING_CHANGE', inheritFromPrevious: ['PERIOD', 'CATEGORY'] }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toEqual({ ...FOOD_THIS_MONTH, intent: 'SPENDING_CHANGE' });
  });

  it('carries the member scope forward only when the new message names none', () => {
    const mine = { ...FOOD_THIS_MONTH, memberScope: 'SENDER' as const };

    expect(
      resolveFollowUp(question({ inheritFromPrevious: ['MEMBER'] }), mine).question.memberScope,
    ).toBe('SENDER');
    expect(
      resolveFollowUp(
        question({
          memberScope: 'NAMED_MEMBER',
          memberName: 'Member C',
          inheritFromPrevious: ['MEMBER'],
        }),
        mine,
      ).question,
    ).toMatchObject({ memberScope: 'NAMED_MEMBER', memberName: 'Member C' });
  });

  it('does not carry over a slot that was not asked for', () => {
    const resolved = resolveFollowUp(
      question({ inheritFromPrevious: ['PERIOD'] }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toMatchObject({ intent: 'SPENDING_TOTAL', category: null });
  });

  it('prefers what the message states over what it inherits', () => {
    const resolved = resolveFollowUp(
      question({
        period: PREVIOUS_MONTH,
        category: 'Transport',
        inheritFromPrevious: ['PERIOD', 'CATEGORY'],
      }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question).toMatchObject({ period: PREVIOUS_MONTH, category: 'Transport' });
  });

  it('reports a follow-up with nothing to follow', () => {
    const resolved = resolveFollowUp(
      question({ inheritFromPrevious: ['INTENT', 'CATEGORY'] }),
      null,
    );

    expect(resolved.problems).toEqual(['NO_PREVIOUS_QUESTION']);
  });

  it('treats blank names as not stated', () => {
    const resolved = resolveFollowUp(
      question({ category: '  ', inheritFromPrevious: ['CATEGORY'] }),
      FOOD_THIS_MONTH,
    );

    expect(resolved.question.category).toBe('Food');
  });

  it('carries only application concepts, never figures or identifiers', () => {
    const resolved = resolveFollowUp(
      question({ inheritFromPrevious: ['INTENT', 'CATEGORY'] }),
      FOOD_THIS_MONTH,
    );

    expect(Object.keys(resolved.question).sort()).toEqual([
      'account',
      'category',
      'intent',
      'memberName',
      'memberScope',
      'period',
    ]);
  });
});
