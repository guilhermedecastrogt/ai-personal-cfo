import type {
  FinancialQuestion,
  QuestionSlot,
} from '../../ai/interpretation/message-interpretation.schema.js';
import type { QuestionFrame } from '../conversation-state.js';

export type FollowUpProblem = 'NO_PREVIOUS_QUESTION';

export interface ResolvedFollowUp {
  readonly question: QuestionFrame;
  readonly problems: readonly FollowUpProblem[];
}

export function resolveFollowUp(
  question: FinancialQuestion,
  previous: QuestionFrame | null,
): ResolvedFollowUp {
  const stated: QuestionFrame = {
    intent: question.intent,
    period: question.period,
    category: textOrNull(question.category),
    account: textOrNull(question.account),
    memberScope: question.memberScope,
    memberName: textOrNull(question.memberName),
  };
  const inherited = new Set<QuestionSlot>(question.inheritFromPrevious);
  if (inherited.size === 0) {
    return { question: stated, problems: [] };
  }
  if (previous === null) {
    return { question: stated, problems: ['NO_PREVIOUS_QUESTION'] };
  }
  const statesMember = stated.memberScope !== 'HOUSEHOLD' || stated.memberName !== null;
  const inheritsMember = inherited.has('MEMBER') && !statesMember;
  return {
    problems: [],
    question: {
      intent: inherited.has('INTENT') ? previous.intent : stated.intent,
      period:
        inherited.has('PERIOD') && stated.period.kind === 'UNSPECIFIED'
          ? previous.period
          : stated.period,
      category: inherited.has('CATEGORY')
        ? (stated.category ?? previous.category)
        : stated.category,
      account: inherited.has('ACCOUNT') ? (stated.account ?? previous.account) : stated.account,
      memberScope: inheritsMember ? previous.memberScope : stated.memberScope,
      memberName: inheritsMember ? previous.memberName : stated.memberName,
    },
  };
}

function textOrNull(value: string | null): string | null {
  const text = value?.trim() ?? '';
  return text === '' ? null : text;
}
