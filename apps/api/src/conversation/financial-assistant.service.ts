import { Injectable, Logger } from '@nestjs/common';
import {
  AIProviderError,
  type AIFailureCategory,
  type ConversationContext,
  type InterpretationRequest,
  type ReplyFacts,
  type ReplySituation,
} from '../ai/ai-provider.js';
import type {
  FinancialQuestion,
  MessageInterpretation,
  TransactionCandidate,
} from '../ai/interpretation/message-interpretation.schema.js';
import { MessageInterpreter } from '../ai/interpretation/message-interpreter.js';
import { AI_UNAVAILABLE_REPLY } from '../ai/reply/fallback-reply.js';
import { ReplyComposer } from '../ai/reply/reply-composer.js';
import { CfoService, type MonthlyReviewResult } from '../cfo/cfo.service.js';
import { formatNarrative } from '../cfo/explanation/narrative-format.js';
import { HouseholdDirectoryService } from '../directory/household-directory.service.js';
import { FinanceService } from '../finance/application/finance.service.js';
import { monthContaining, type IsoDate } from '../finance/domain/period/period.js';
import type { RequestContext } from '../households/request-context.js';
import { toCategoryOptions } from './category-options.js';
import { CONVERSATION_POLICY } from './conversation-policy.js';
import type { ConversationState, QuestionFrame } from './conversation-state.js';
import { ConversationsRepository, type OpenConversation } from './conversations.repository.js';
import { completePendingCandidate } from './extraction/pending-transaction.js';
import {
  TransactionExtractionService,
  type ExtractionOutcome,
} from './extraction/transaction-extraction.service.js';
import { resolveFollowUp } from './follow-up/question-resolution.js';
import {
  ImageTransactionService,
  type ImageMessage,
  type ImageOutcome,
} from './image/image-transaction.service.js';
import {
  FinancialQueryService,
  isQueryFrame,
  type QueryOutcome,
} from './queries/financial-query.service.js';
import { resolvePeriodReference } from './queries/period-reference.js';

const IMAGE_PLACEHOLDER = '[image]';

export interface IncomingMessage {
  readonly text: string;
  readonly sourceMessageId?: string;
}

export type AssistantOutcome =
  | { readonly kind: 'TRANSACTION'; readonly extraction: ExtractionOutcome }
  | { readonly kind: 'QUESTION'; readonly query: QueryOutcome }
  | { readonly kind: 'IMAGE'; readonly image: ImageOutcome }
  | { readonly kind: 'REVIEW'; readonly review: MonthlyReviewResult }
  | { readonly kind: 'CORRECTION' }
  | { readonly kind: 'UNCLEAR' }
  | { readonly kind: 'OTHER' }
  | { readonly kind: 'AI_UNAVAILABLE'; readonly category: AIFailureCategory };

export interface AssistantResponse {
  readonly reply: string;
  readonly outcome: AssistantOutcome;
}

type ActedOutcome = Exclude<AssistantOutcome, { kind: 'AI_UNAVAILABLE' | 'IMAGE' }>;

interface Turn {
  readonly response: AssistantResponse;
  readonly state: ConversationState | undefined;
}

interface Action {
  readonly outcome: ActedOutcome;
  readonly state: ConversationState | undefined;
}

interface ReplyPlan {
  readonly situation: ReplySituation;
  readonly facts: ReplyFacts;
}

@Injectable()
export class FinancialAssistant {
  private readonly logger = new Logger(FinancialAssistant.name);
  private readonly policy = CONVERSATION_POLICY;

  constructor(
    private readonly interpreter: MessageInterpreter,
    private readonly replies: ReplyComposer,
    private readonly extraction: TransactionExtractionService,
    private readonly queries: FinancialQueryService,
    private readonly images: ImageTransactionService,
    private readonly cfo: CfoService,
    private readonly finance: FinanceService,
    private readonly conversations: ConversationsRepository,
    private readonly directories: HouseholdDirectoryService,
  ) {}

  async handle(
    context: RequestContext,
    message: IncomingMessage,
    instant: Date,
  ): Promise<AssistantResponse> {
    const text = message.text.slice(0, this.policy.maximumMessageLength);
    const bounded = { ...message, text };
    return this.converse(context, text, message.sourceMessageId, instant, (today, conversation) =>
      this.respond(context, bounded, today, conversation),
    );
  }

  async handleImage(
    context: RequestContext,
    message: ImageMessage,
    instant: Date,
  ): Promise<AssistantResponse> {
    const caption = (message.caption?.trim() ?? '').slice(0, this.policy.maximumMessageLength);
    const turn = caption === '' ? IMAGE_PLACEHOLDER : `${IMAGE_PLACEHOLDER} ${caption}`;
    return this.converse(context, turn, message.sourceMessageId, instant, (today, conversation) =>
      this.respondToImage(context, message, caption, today, conversation.state),
    );
  }

  private async converse(
    context: RequestContext,
    userTurn: string,
    sourceMessageId: string | undefined,
    instant: Date,
    respond: (today: IsoDate, conversation: OpenConversation) => Promise<Turn>,
  ): Promise<AssistantResponse> {
    const today = await this.finance.currentDate(context.householdId, instant);
    const conversation = await this.conversations.open(context, instant);
    await this.conversations.append(conversation.id, 'USER', userTurn, sourceMessageId);
    const { response, state } = await respond(today, conversation);
    await this.conversations.append(conversation.id, 'ASSISTANT', response.reply);
    if (state !== undefined) {
      await this.conversations.saveState(context, conversation.id, state, instant);
    }
    this.logger.log(`channel=${context.channel} outcome=${summarize(response.outcome)}`);
    return response;
  }

  private async respond(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    conversation: OpenConversation,
  ): Promise<Turn> {
    let interpretation: MessageInterpretation;
    try {
      interpretation = await this.interpreter.interpret(
        await this.buildInterpretationRequest(context, message.text, conversation),
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        return { response: unavailable(error), state: undefined };
      }
      throw error;
    }
    const { outcome, state } = await this.act(
      context,
      message,
      today,
      conversation.state,
      interpretation,
    );
    if (outcome.kind === 'REVIEW') {
      return { response: { reply: formatNarrative(outcome.review.narrative), outcome }, state };
    }
    const reply = await this.replies.compose({
      ...planReply(outcome),
      userMessage: message.text,
      senderName: context.memberName,
    });
    return { response: { reply, outcome }, state };
  }

  private async respondToImage(
    context: RequestContext,
    message: ImageMessage,
    caption: string,
    today: IsoDate,
    state: ConversationState,
  ): Promise<Turn> {
    let image: ImageOutcome;
    try {
      image = await this.images.extract(context, message, today);
    } catch (error) {
      if (error instanceof AIProviderError) {
        return { response: unavailable(error), state: undefined };
      }
      throw error;
    }
    const outcome = { kind: 'IMAGE', image } as const;
    const reply = await this.replies.compose({
      ...planReply(outcome),
      userMessage: caption,
      senderName: context.memberName,
    });
    return {
      response: { reply, outcome },
      state: afterImage(state, image, message.sourceMessageId ?? null),
    };
  }

  private async act(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    state: ConversationState,
    interpretation: MessageInterpretation,
  ): Promise<Action> {
    switch (interpretation.kind) {
      case 'TRANSACTION':
        return this.recordTransaction(context, message, today, state, interpretation);
      case 'QUESTION':
        return this.answerQuestion(context, message, today, state, interpretation.question);
      case 'CORRECTION':
      case 'UNCLEAR':
      case 'OTHER':
        return { outcome: { kind: interpretation.kind }, state: undefined };
    }
  }

  private async recordTransaction(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    state: ConversationState,
    interpretation: Extract<MessageInterpretation, { kind: 'TRANSACTION' }>,
  ): Promise<Action> {
    const pending = interpretation.completesPending ? state.pendingTransaction : null;
    const candidate: TransactionCandidate =
      pending === null
        ? interpretation.transaction
        : completePendingCandidate(pending.candidate, interpretation.transaction);
    const medium = pending?.medium ?? 'TEXT';
    const sourceMessageId =
      pending === null ? message.sourceMessageId : (pending.sourceMessageId ?? undefined);
    const extraction = await this.extraction.extract({
      context,
      candidate,
      today,
      medium,
      ...(sourceMessageId === undefined ? {} : { sourceMessageId }),
    });
    return {
      outcome: { kind: 'TRANSACTION', extraction },
      state:
        extraction.status === 'RECORDED'
          ? { ...state, lastOutcome: 'TRANSACTION_RECORDED', pendingTransaction: null }
          : {
              ...state,
              lastOutcome: 'TRANSACTION_PENDING',
              pendingTransaction: {
                candidate: extraction.candidate,
                reasons: [...extraction.reasons],
                medium,
                sourceMessageId: sourceMessageId ?? null,
              },
            },
    };
  }

  private async answerQuestion(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    state: ConversationState,
    question: FinancialQuestion,
  ): Promise<Action> {
    const followUp = resolveFollowUp(question, state.question);
    if (followUp.problems.length > 0) {
      return {
        outcome: clarifyQuestion(followUp.problems, null),
        state: undefined,
      };
    }
    const frame = followUp.question;
    if (!isQueryFrame(frame)) {
      return this.review(context, message, today, frame);
    }
    const query = await this.queries.answer(context, frame, today);
    return {
      outcome: { kind: 'QUESTION', query },
      state: {
        lastOutcome: query.status === 'ANSWERED' ? 'QUESTION_ANSWERED' : 'QUESTION_PENDING',
        question: query.frame ?? state.question,
        pendingTransaction: null,
      },
    };
  }

  private async review(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    frame: QuestionFrame,
  ): Promise<Action> {
    const period = resolvePeriodReference(frame.period, today);
    if (period === undefined || monthContaining(period.start).start > today) {
      return { outcome: clarifyQuestion(['UNRESOLVABLE_PERIOD'], null), state: undefined };
    }
    const review = await this.cfo.monthlyReview(context, {
      month: monthContaining(period.end < today ? period.end : today),
      today,
      userMessage: message.text,
    });
    return {
      outcome: { kind: 'REVIEW', review },
      state: {
        lastOutcome: 'REVIEW_GIVEN',
        question: {
          ...frame,
          category: null,
          account: null,
          memberScope: 'HOUSEHOLD',
          memberName: null,
        },
        pendingTransaction: null,
      },
    };
  }

  private async buildInterpretationRequest(
    context: RequestContext,
    text: string,
    conversation: OpenConversation,
  ): Promise<InterpretationRequest> {
    const directory = await this.directories.load(context.householdId);
    return {
      message: text,
      conversation: describeConversation(conversation),
      senderName: context.memberName,
      memberNames: directory.members.map((member) => member.name),
      accountNames: directory.accounts.map((account) => account.name),
      categories: toCategoryOptions(directory.categories),
    };
  }
}

function describeConversation(conversation: OpenConversation): ConversationContext {
  const { state } = conversation;
  const pending = state.pendingTransaction;
  return {
    recentUserMessages: conversation.recentUserMessages,
    lastOutcome: state.lastOutcome,
    previousQuestion: state.question,
    pendingTransaction:
      pending === null
        ? null
        : { understood: withoutConfidence(pending.candidate), stillNeeded: pending.reasons },
  };
}

function withoutConfidence(candidate: TransactionCandidate): Record<string, unknown> {
  return Object.fromEntries(Object.entries(candidate).filter(([field]) => field !== 'confidence'));
}

function afterImage(
  state: ConversationState,
  image: ImageOutcome,
  sourceMessageId: string | null,
): ConversationState | undefined {
  if (image.status === 'RECORDED' || image.status === 'ALREADY_RECORDED') {
    return { ...state, lastOutcome: 'TRANSACTION_RECORDED', pendingTransaction: null };
  }
  if (image.status === 'NEEDS_CLARIFICATION' && image.candidate !== null) {
    return {
      ...state,
      lastOutcome: 'TRANSACTION_PENDING',
      pendingTransaction: {
        candidate: image.candidate,
        reasons: [...image.reasons],
        medium: 'IMAGE',
        sourceMessageId,
      },
    };
  }
  return undefined;
}

function clarifyQuestion(
  reasons: readonly ('NO_PREVIOUS_QUESTION' | 'UNRESOLVABLE_PERIOD')[],
  frame: QuestionFrame | null,
): Extract<AssistantOutcome, { kind: 'QUESTION' }> {
  return {
    kind: 'QUESTION',
    query: { status: 'NEEDS_CLARIFICATION', reasons, frame, facts: { reasons } },
  };
}

function planReply(
  outcome: Exclude<AssistantOutcome, { kind: 'AI_UNAVAILABLE' | 'REVIEW' }>,
): ReplyPlan {
  switch (outcome.kind) {
    case 'TRANSACTION':
      return {
        situation:
          outcome.extraction.status === 'RECORDED'
            ? 'TRANSACTION_RECORDED'
            : 'CLARIFICATION_NEEDED',
        facts: outcome.extraction.facts,
      };
    case 'QUESTION':
      return {
        situation:
          outcome.query.status === 'ANSWERED' ? 'QUESTION_ANSWERED' : 'CLARIFICATION_NEEDED',
        facts: outcome.query.facts,
      };
    case 'IMAGE':
      return { situation: IMAGE_SITUATIONS[outcome.image.status], facts: outcome.image.facts };
    case 'CORRECTION':
      return { situation: 'EDIT_NOT_SUPPORTED', facts: {} };
    case 'UNCLEAR':
      return { situation: 'CLARIFICATION_NEEDED', facts: { reasons: ['AMBIGUOUS_REFERENCE'] } };
    case 'OTHER':
      return { situation: 'OUT_OF_SCOPE', facts: {} };
  }
}

const IMAGE_SITUATIONS: Record<ImageOutcome['status'], ReplySituation> = {
  RECORDED: 'TRANSACTION_RECORDED',
  ALREADY_RECORDED: 'TRANSACTION_RECORDED',
  NEEDS_CLARIFICATION: 'CLARIFICATION_NEEDED',
  IMAGE_NOT_USABLE: 'IMAGE_NOT_USABLE',
};

function unavailable(error: AIProviderError): AssistantResponse {
  return {
    reply: AI_UNAVAILABLE_REPLY,
    outcome: { kind: 'AI_UNAVAILABLE', category: error.category },
  };
}

function summarize(outcome: AssistantOutcome): string {
  switch (outcome.kind) {
    case 'TRANSACTION':
      return `transaction:${outcome.extraction.status}`;
    case 'QUESTION':
      return `question:${outcome.query.status}`;
    case 'IMAGE':
      return `image:${outcome.image.status}`;
    case 'REVIEW':
      return `review:${outcome.review.narrativeSource}`;
    case 'AI_UNAVAILABLE':
      return `ai-unavailable:${outcome.category}`;
    default:
      return outcome.kind.toLowerCase();
  }
}
