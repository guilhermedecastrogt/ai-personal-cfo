import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.js';
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
import { aiUnavailableReply } from '../ai/reply/fallback-reply.js';
import { ReplyComposer } from '../ai/reply/reply-composer.js';
import { CfoService, type MonthlyReviewResult } from '../cfo/cfo.service.js';
import { formatNarrative } from '../cfo/explanation/narrative-format.js';
import { HouseholdDirectoryService } from '../directory/household-directory.service.js';
import { FinanceService } from '../finance/application/finance.service.js';
import { monthContaining, type IsoDate } from '../finance/domain/period/period.js';
import type { RequestContext } from '../households/request-context.js';
import { toCategoryOptions } from './category-options.js';
import { CONVERSATION_POLICY } from './conversation-policy.js';
import {
  MAXIMUM_QUEUED_TRANSACTIONS,
  type ConversationState,
  type PendingTransaction,
  type QuestionFrame,
} from './conversation-state.js';
import { ConversationsRepository, type OpenConversation } from './conversations.repository.js';
import { answerPendingTransaction } from './extraction/pending-answer.js';
import { completePendingCandidate } from './extraction/pending-transaction.js';
import {
  TransactionExtractionService,
  type ExtractionOutcome,
  type PreparedTransaction,
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
import { readConfirmation, type Confirmation } from './confirmation.js';
import { CorrectionService, type CorrectionOutcome } from './corrections/correction.service.js';
import { describeNeeds, describeStoredNeeds } from './extraction/clarification-needs.js';
import {
  acknowledgementReply,
  alreadyRecordedReply,
  confirmDeletionReply,
  correctedReply,
  deletedReply,
  discardedReply,
  keptTransactionReply,
  notCorrectedReply,
  notFoundReply,
  recordedReply,
  staleReply,
  stillNeededReply,
  unchangedReply,
  whichOneReply,
} from './replies/deterministic-replies.js';
import { summarizeTransaction, type TransactionSummary } from './replies/transaction-summary.js';
import type { Transaction } from '../transactions/transactions.service.js';

const IMAGE_PLACEHOLDER = '[image]';

const WELCOME_CAPABILITIES = [
  'Records expenses and income written naturally, in any language, with category and account',
  'Reads a photo of a receipt and records it',
  'Answers questions about spending, income, budgets, goals and balances, from the household records',
  'Reviews the month: what changed, what went well and where to pay attention',
  'Tracks subscriptions and recurring payments, including price increases',
  'Keeps a private web dashboard for the household, opened with a personal access code',
];

const WELCOME_EXAMPLES = [
  'Spent 12 euros at Tesco',
  'Received my salary of 2500 euros',
  'How much did we spend this month?',
  'How was our month?',
  'What subscriptions do we have?',
];

export interface IncomingMessage {
  readonly text: string;
  readonly sourceMessageId?: string;
}

export type AssistantOutcome =
  | {
      readonly kind: 'TRANSACTION';
      readonly extraction: ExtractionOutcome;
      readonly recorded: readonly Transaction[];
      readonly queued: number;
    }
  | { readonly kind: 'QUESTION'; readonly query: QueryOutcome }
  | { readonly kind: 'IMAGE'; readonly image: ImageOutcome }
  | { readonly kind: 'REVIEW'; readonly review: MonthlyReviewResult }
  | { readonly kind: 'CORRECTION'; readonly result: CorrectionOutcome }
  | { readonly kind: 'UNCLEAR' }
  | { readonly kind: 'OTHER' }
  | { readonly kind: 'WELCOME'; readonly facts: ReplyFacts }
  | { readonly kind: 'ACKNOWLEDGED'; readonly confirmation: Confirmation }
  | { readonly kind: 'AI_UNAVAILABLE'; readonly category: AIFailureCategory };

export interface AssistantResponse {
  readonly reply: string;
  readonly outcome: AssistantOutcome;
}

type ActedOutcome = Exclude<
  AssistantOutcome,
  { kind: 'AI_UNAVAILABLE' | 'IMAGE' | 'ACKNOWLEDGED' }
>;

type RepliedOutcome = Exclude<
  AssistantOutcome,
  { kind: 'AI_UNAVAILABLE' | 'REVIEW' | 'ACKNOWLEDGED' }
>;

interface Turn {
  readonly response: AssistantResponse;
  readonly state: ConversationState | undefined;
}

interface Action {
  readonly outcome: ActedOutcome;
  readonly state: ConversationState | undefined;
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
    private readonly corrections: CorrectionService,
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
    const confirmed = await this.answerWithoutInterpreter(context, message, today, conversation);
    if (confirmed !== undefined) {
      return confirmed;
    }
    const hadPendingDeletion = conversation.state.pendingDeletion !== null;
    const current: ConversationState = { ...conversation.state, pendingDeletion: null };
    let interpretation: MessageInterpretation;
    try {
      interpretation = await this.interpreter.interpret(
        await this.buildInterpretationRequest(context, message.text, conversation),
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        return { response: unavailable(error, context), state: undefined };
      }
      throw error;
    }
    const acted = await this.act(context, message, today, conversation.id, current, interpretation);
    const { outcome } = acted;
    const state = acted.state ?? (hadPendingDeletion ? current : undefined);
    if (outcome.kind === 'REVIEW') {
      return { response: { reply: formatNarrative(outcome.review.narrative), outcome }, state };
    }
    const settled =
      outcome.kind === 'OTHER' && conversation.recentUserMessages.length === 0
        ? await this.welcome(context)
        : outcome;
    const reply = await this.reply(context, settled, message.text, today);
    return { response: { reply, outcome: settled }, state };
  }

  private async reply(
    context: RequestContext,
    outcome: RepliedOutcome,
    userMessage: string,
    today: IsoDate,
  ): Promise<string> {
    const locale = context.locale ?? DEFAULT_LOCALE;
    const plan = planReply(outcome);
    if (plan.kind === 'COMPOSE') {
      return this.compose(context, plan.situation, plan.facts, userMessage);
    }
    const directory = await this.directories.load(context.householdId);
    const summaryOf = (transaction: Transaction): TransactionSummary =>
      summarizeTransaction(transaction, directory, context.memberId);
    if (plan.kind === 'CORRECTION') {
      return correctionReply(plan.result, summaryOf, locale, today);
    }
    const summaries = plan.transactions.map(summaryOf);
    const [first] = summaries;
    if (plan.kind === 'RECORDED_AND_ASK') {
      const question = await this.compose(context, 'CLARIFICATION_NEEDED', plan.facts, userMessage);
      return `${recordedReply(summaries, locale, today)}\n\n${question}`;
    }
    return plan.alreadyRecorded && first !== undefined
      ? alreadyRecordedReply(first, locale, today)
      : recordedReply(summaries, locale, today);
  }

  private compose(
    context: RequestContext,
    situation: ReplySituation,
    facts: ReplyFacts,
    userMessage: string,
  ): Promise<string> {
    return this.replies.compose({
      situation,
      facts,
      userMessage,
      senderName: context.memberName,
      locale: context.locale ?? DEFAULT_LOCALE,
    });
  }

  private async answerWithoutInterpreter(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    conversation: OpenConversation,
  ): Promise<Turn | undefined> {
    const confirmation = readConfirmation(message.text);
    if (confirmation === undefined) {
      return undefined;
    }
    const locale = context.locale ?? DEFAULT_LOCALE;
    const { state } = conversation;
    const pending = state.pendingTransaction;
    const acknowledged = { kind: 'ACKNOWLEDGED', confirmation } as const;
    if (state.pendingDeletion !== null) {
      const cleared: ConversationState = { ...state, pendingDeletion: null };
      if (confirmation === 'NO') {
        return {
          response: { reply: keptTransactionReply(locale), outcome: acknowledged },
          state: { ...cleared, lastOutcome: 'NONE' },
        };
      }
      const result = await this.corrections.confirmDeletion(
        context,
        conversation.id,
        state.pendingDeletion,
        today,
      );
      const outcome = { kind: 'CORRECTION', result } as const;
      return {
        response: { reply: await this.reply(context, outcome, message.text, today), outcome },
        state: afterCorrection(cleared, result) ?? cleared,
      };
    }
    if (pending === null) {
      return conversation.recentUserMessages.length === 0
        ? undefined
        : {
            response: { reply: acknowledgementReply(locale), outcome: acknowledged },
            state: undefined,
          };
    }
    if (confirmation === 'NO') {
      return {
        response: { reply: discardedReply(locale), outcome: acknowledged },
        state: { ...state, lastOutcome: 'NONE', pendingTransaction: null, queuedTransactions: [] },
      };
    }
    if (!pending.reasons.every((reason) => reason === 'LOW_CONFIDENCE')) {
      return {
        response: {
          reply: stillNeededReply(describeStoredNeeds(pending.reasons, locale), locale),
          outcome: acknowledged,
        },
        state: undefined,
      };
    }
    const { outcome, state: recorded } = await this.recordTransaction(
      context,
      message,
      today,
      state,
      {
        kind: 'TRANSACTION',
        transactions: [{ ...pending.candidate, confidence: 1 }],
        completesPending: true,
      },
    );
    if (outcome.kind !== 'TRANSACTION') {
      return undefined;
    }
    return {
      response: { reply: await this.reply(context, outcome, message.text, today), outcome },
      state: recorded,
    };
  }

  private async welcome(context: RequestContext): Promise<AssistantOutcome & { kind: 'WELCOME' }> {
    const [directory, account] = await Promise.all([
      this.directories.load(context.householdId),
      this.directories.defaultAccount(context.householdId, context.memberId),
    ]);
    return {
      kind: 'WELCOME',
      facts: {
        member: context.memberName,
        otherMembers: directory.members
          .filter((member) => member.id !== context.memberId)
          .map((member) => member.name),
        defaultAccount: account?.name ?? null,
        capabilities: WELCOME_CAPABILITIES,
        examples: WELCOME_EXAMPLES,
      },
    };
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
        return { response: unavailable(error, context), state: undefined };
      }
      throw error;
    }
    const outcome = { kind: 'IMAGE', image } as const;
    const reply = await this.reply(context, outcome, caption, today);
    return {
      response: { reply, outcome },
      state: afterImage(state, image, message.sourceMessageId ?? null),
    };
  }

  private async act(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    conversationId: string,
    state: ConversationState,
    interpretation: MessageInterpretation,
  ): Promise<Action> {
    switch (interpretation.kind) {
      case 'TRANSACTION':
        return this.recordTransaction(context, message, today, state, interpretation);
      case 'QUESTION':
        return this.answerQuestion(context, message, today, state, interpretation.question);
      case 'UNCLEAR':
      case 'OTHER': {
        const answered = await this.answerPending(context, message.text, state);
        return answered === undefined
          ? { outcome: { kind: interpretation.kind }, state: undefined }
          : this.recordTransaction(context, message, today, state, {
              kind: 'TRANSACTION',
              transactions: [answered],
              completesPending: true,
            });
      }
      case 'CORRECTION': {
        const result = await this.corrections.correct(
          context,
          conversationId,
          interpretation.correction,
          today,
        );
        return { outcome: { kind: 'CORRECTION', result }, state: afterCorrection(state, result) };
      }
    }
  }

  private async answerPending(
    context: RequestContext,
    text: string,
    state: ConversationState,
  ): Promise<TransactionCandidate | undefined> {
    const pending = state.pendingTransaction;
    if (pending === null) {
      return undefined;
    }
    const directory = await this.directories.load(context.householdId);
    return answerPendingTransaction(text, pending, {
      accounts: directory.accounts,
      categories: directory.categories,
      members: directory.members,
      senderId: context.memberId,
    });
  }

  private async recordTransaction(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    state: ConversationState,
    interpretation: Extract<MessageInterpretation, { kind: 'TRANSACTION' }>,
  ): Promise<Action> {
    const pending = interpretation.completesPending ? state.pendingTransaction : null;
    const [first, ...rest] = interpretation.transactions;
    const fresh = (candidate: TransactionCandidate): PendingTransaction => ({
      candidate,
      reasons: [],
      medium: 'TEXT',
      sourceMessageId: message.sourceMessageId ?? null,
    });
    const work: PendingTransaction[] = [
      pending === null
        ? fresh(first)
        : { ...pending, candidate: completePendingCandidate(pending.candidate, first) },
      ...rest.map(fresh),
    ];
    const carried = pending === null ? [] : [...state.queuedTransactions];
    const recorded: Extract<ExtractionOutcome, { status: 'RECORDED' }>[] = [];
    let waiting: { item: PendingTransaction; outcome: ExtractionOutcome }[] = [];
    while (work.length > 0) {
      const prepared = await Promise.all(
        work.map(async (item) => ({ item, outcome: await this.prepare(context, item, today) })),
      );
      const ready = prepared.flatMap(({ outcome }) =>
        outcome.status === 'READY' ? [outcome] : [],
      );
      recorded.push(...(await this.extraction.record(context.householdId, ready, new Date())));
      waiting = prepared.flatMap(({ item, outcome }) =>
        outcome.status === 'NEEDS_CLARIFICATION' ? [{ item, outcome }] : [],
      );
      work.length = 0;
      const next = carried.shift();
      if (waiting.length === 0 && next !== undefined) {
        work.push(next);
      }
    }
    const queue: PendingTransaction[] = [
      ...waiting.slice(1).map(({ item, outcome }) => toPending(item, outcome)),
      ...carried,
    ].slice(0, MAXIMUM_QUEUED_TRANSACTIONS);
    const [asked] = waiting;
    const extraction = asked?.outcome ?? recorded.at(-1);
    if (extraction === undefined) {
      throw new Error('A transaction turn ended with nothing recorded or asked');
    }
    const transactions = recorded.map((outcome) => outcome.transaction);
    return {
      outcome: { kind: 'TRANSACTION', extraction, recorded: transactions, queued: queue.length },
      state:
        asked === undefined
          ? {
              ...state,
              lastOutcome:
                transactions.length > 1 ? 'TRANSACTIONS_RECORDED' : 'TRANSACTION_RECORDED',
              pendingTransaction: null,
              queuedTransactions: [],
            }
          : {
              ...state,
              lastOutcome: 'TRANSACTION_PENDING',
              pendingTransaction: toPending(asked.item, asked.outcome),
              queuedTransactions: queue,
            },
    };
  }

  private async prepare(
    context: RequestContext,
    item: PendingTransaction,
    today: IsoDate,
  ): Promise<PreparedTransaction> {
    return this.extraction.prepare({
      context,
      candidate: item.candidate,
      today,
      medium: item.medium,
      ...(item.sourceMessageId === null ? {} : { sourceMessageId: item.sourceMessageId }),
    });
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
        queuedTransactions: [],
        pendingDeletion: null,
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
        queuedTransactions: [],
        pendingDeletion: null,
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
    return {
      ...state,
      lastOutcome: 'TRANSACTION_RECORDED',
      pendingTransaction: null,
      queuedTransactions: [],
    };
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
      queuedTransactions: [],
    };
  }
  return undefined;
}

function afterCorrection(
  state: ConversationState,
  result: CorrectionOutcome,
): ConversationState | undefined {
  switch (result.status) {
    case 'CORRECTED':
      return { ...state, lastOutcome: 'TRANSACTION_CORRECTED', pendingDeletion: null };
    case 'DELETED':
      return { ...state, lastOutcome: 'TRANSACTION_DELETED', pendingDeletion: null };
    case 'CONFIRM_DELETION':
      return { ...state, lastOutcome: 'DELETION_PENDING', pendingDeletion: result.pending };
    case 'AMBIGUOUS':
      return { ...state, lastOutcome: 'CORRECTION_PENDING', pendingDeletion: null };
    default:
      return undefined;
  }
}

function correctionReply(
  result: CorrectionOutcome,
  summarize: (transaction: Transaction) => TransactionSummary,
  locale: Locale,
  today: IsoDate,
): string {
  switch (result.status) {
    case 'CORRECTED':
      return correctedReply(summarize(result.transaction), locale, today);
    case 'CONFIRM_DELETION':
      return confirmDeletionReply(summarize(result.transaction), locale, today);
    case 'DELETED':
      return deletedReply(summarize(result.transaction), locale, today);
    case 'AMBIGUOUS':
      return whichOneReply(result.transactions.map(summarize), locale, today);
    case 'UNCHANGED':
      return unchangedReply(summarize(result.transaction), locale, today);
    case 'REJECTED':
      return notCorrectedReply(describeNeeds(result.reasons, locale), locale);
    case 'STALE':
      return staleReply(locale);
    case 'NOT_FOUND':
      return notFoundReply(locale);
  }
}

function toPending(item: PendingTransaction, outcome: ExtractionOutcome): PendingTransaction {
  return outcome.status === 'NEEDS_CLARIFICATION'
    ? { ...item, candidate: outcome.candidate, reasons: [...outcome.reasons] }
    : item;
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

type ReplyPlanned =
  | { readonly kind: 'COMPOSE'; readonly situation: ReplySituation; readonly facts: ReplyFacts }
  | {
      readonly kind: 'RECORDED';
      readonly transactions: readonly Transaction[];
      readonly alreadyRecorded: boolean;
    }
  | {
      readonly kind: 'RECORDED_AND_ASK';
      readonly transactions: readonly Transaction[];
      readonly facts: ReplyFacts;
    }
  | { readonly kind: 'CORRECTION'; readonly result: CorrectionOutcome };

function compose(situation: ReplySituation, facts: ReplyFacts): ReplyPlanned {
  return { kind: 'COMPOSE', situation, facts };
}

function planReply(outcome: RepliedOutcome): ReplyPlanned {
  switch (outcome.kind) {
    case 'TRANSACTION':
      return planTransactionReply(outcome);
    case 'QUESTION':
      return compose(
        outcome.query.status === 'ANSWERED' ? 'QUESTION_ANSWERED' : 'CLARIFICATION_NEEDED',
        outcome.query.facts,
      );
    case 'IMAGE':
      return planImageReply(outcome.image);
    case 'CORRECTION':
      return { kind: 'CORRECTION', result: outcome.result };
    case 'UNCLEAR':
      return compose('CLARIFICATION_NEEDED', { reasons: ['AMBIGUOUS_REFERENCE'] });
    case 'OTHER':
      return compose('OUT_OF_SCOPE', {});
    case 'WELCOME':
      return compose('WELCOME', outcome.facts);
  }
}

function planTransactionReply(
  outcome: Extract<AssistantOutcome, { kind: 'TRANSACTION' }>,
): ReplyPlanned {
  const { extraction, recorded, queued } = outcome;
  if (extraction.status === 'RECORDED') {
    return { kind: 'RECORDED', transactions: recorded, alreadyRecorded: false };
  }
  const facts = queued === 0 ? extraction.facts : { ...extraction.facts, stillToAsk: queued };
  return recorded.length === 0
    ? compose('CLARIFICATION_NEEDED', facts)
    : { kind: 'RECORDED_AND_ASK', transactions: recorded, facts };
}

function planImageReply(image: ImageOutcome): ReplyPlanned {
  switch (image.status) {
    case 'RECORDED':
      return { kind: 'RECORDED', transactions: [image.transaction], alreadyRecorded: false };
    case 'ALREADY_RECORDED':
      return { kind: 'RECORDED', transactions: [image.transaction], alreadyRecorded: true };
    case 'NEEDS_CLARIFICATION':
      return compose('CLARIFICATION_NEEDED', image.facts);
    case 'IMAGE_NOT_USABLE':
      return compose('IMAGE_NOT_USABLE', image.facts);
  }
}

function unavailable(error: AIProviderError, context: RequestContext): AssistantResponse {
  return {
    reply: aiUnavailableReply(context.locale),
    outcome: { kind: 'AI_UNAVAILABLE', category: error.category },
  };
}

function summarize(outcome: AssistantOutcome): string {
  switch (outcome.kind) {
    case 'TRANSACTION':
      return `transaction:recorded=${String(outcome.recorded.length)},pending=${String(
        (outcome.extraction.status === 'NEEDS_CLARIFICATION' ? 1 : 0) + outcome.queued,
      )}`;
    case 'QUESTION':
      return `question:${outcome.query.status}`;
    case 'IMAGE':
      return `image:${outcome.image.status}`;
    case 'CORRECTION':
      return `correction:${outcome.result.status}`;
    case 'REVIEW':
      return `review:${outcome.review.narrativeSource}`;
    case 'AI_UNAVAILABLE':
      return `ai-unavailable:${outcome.category}`;
    default:
      return outcome.kind.toLowerCase();
  }
}
