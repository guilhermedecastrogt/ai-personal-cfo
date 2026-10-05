import { Injectable, Logger } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import {
  AIProviderError,
  type AIFailureCategory,
  type InterpretationRequest,
  type ReplyFacts,
  type ReplySituation,
} from '../ai/ai-provider.js';
import type { MessageInterpretation } from '../ai/interpretation/message-interpretation.schema.js';
import { MessageInterpreter } from '../ai/interpretation/message-interpreter.js';
import { AI_UNAVAILABLE_REPLY } from '../ai/reply/fallback-reply.js';
import { ReplyComposer } from '../ai/reply/reply-composer.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { FinanceService } from '../finance/application/finance.service.js';
import type { IsoDate } from '../finance/domain/period/period.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import type { RequestContext } from '../households/request-context.js';
import { ConversationsRepository } from './conversations.repository.js';
import {
  TransactionExtractionService,
  type ExtractionOutcome,
} from './extraction/transaction-extraction.service.js';
import {
  ImageTransactionService,
  type ImageMessage,
  type ImageOutcome,
} from './image/image-transaction.service.js';
import { toCategoryOptions } from './category-options.js';
import { FinancialQueryService, type QueryOutcome } from './queries/financial-query.service.js';

const HISTORY_TURNS = 6;
const IMAGE_PLACEHOLDER = '[image]';

export interface IncomingMessage {
  readonly text: string;
  readonly sourceMessageId?: string;
}

export type AssistantOutcome =
  | { readonly kind: 'TRANSACTION'; readonly extraction: ExtractionOutcome }
  | { readonly kind: 'QUESTION'; readonly query: QueryOutcome }
  | { readonly kind: 'IMAGE'; readonly image: ImageOutcome }
  | { readonly kind: 'OTHER' }
  | { readonly kind: 'AI_UNAVAILABLE'; readonly category: AIFailureCategory };

export interface AssistantResponse {
  readonly reply: string;
  readonly outcome: AssistantOutcome;
}

interface ReplyPlan {
  readonly situation: ReplySituation;
  readonly facts: ReplyFacts;
}

@Injectable()
export class FinancialAssistant {
  private readonly logger = new Logger(FinancialAssistant.name);

  constructor(
    private readonly interpreter: MessageInterpreter,
    private readonly replies: ReplyComposer,
    private readonly extraction: TransactionExtractionService,
    private readonly queries: FinancialQueryService,
    private readonly images: ImageTransactionService,
    private readonly finance: FinanceService,
    private readonly conversations: ConversationsRepository,
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
  ) {}

  async handle(
    context: RequestContext,
    message: IncomingMessage,
    instant: Date,
  ): Promise<AssistantResponse> {
    return this.converse(
      context,
      message.text,
      message.sourceMessageId,
      instant,
      (today, history) => this.respond(context, message, today, history),
    );
  }

  async handleImage(
    context: RequestContext,
    message: ImageMessage,
    instant: Date,
  ): Promise<AssistantResponse> {
    const caption = message.caption?.trim() ?? '';
    const turn = caption === '' ? IMAGE_PLACEHOLDER : `${IMAGE_PLACEHOLDER} ${caption}`;
    return this.converse(context, turn, message.sourceMessageId, instant, (today) =>
      this.respondToImage(context, message, caption, today),
    );
  }

  private async converse(
    context: RequestContext,
    userTurn: string,
    sourceMessageId: string | undefined,
    instant: Date,
    respond: (
      today: IsoDate,
      history: InterpretationRequest['history'],
    ) => Promise<AssistantResponse>,
  ): Promise<AssistantResponse> {
    const today = await this.finance.currentDate(context.householdId, instant);
    const conversationId = await this.conversations.open(context);
    const history = await this.conversations.recentTurns(
      context.householdId,
      conversationId,
      HISTORY_TURNS,
    );
    await this.conversations.append(conversationId, 'USER', userTurn, sourceMessageId);
    const response = await respond(today, history);
    await this.conversations.append(conversationId, 'ASSISTANT', response.reply);
    this.logger.log(`channel=${context.channel} outcome=${summarize(response.outcome)}`);
    return response;
  }

  private async respondToImage(
    context: RequestContext,
    message: ImageMessage,
    caption: string,
    today: IsoDate,
  ): Promise<AssistantResponse> {
    let image: ImageOutcome;
    try {
      image = await this.images.extract(context, message, today);
    } catch (error) {
      if (error instanceof AIProviderError) {
        return unavailable(error);
      }
      throw error;
    }
    const outcome = { kind: 'IMAGE', image } as const;
    const reply = await this.replies.compose({
      ...planReply(outcome),
      userMessage: caption,
      senderName: context.memberName,
    });
    return { reply, outcome };
  }

  private async respond(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    history: InterpretationRequest['history'],
  ): Promise<AssistantResponse> {
    let interpretation: MessageInterpretation;
    try {
      interpretation = await this.interpreter.interpret(
        await this.buildInterpretationRequest(context, message.text, history),
      );
    } catch (error) {
      if (error instanceof AIProviderError) {
        return unavailable(error);
      }
      throw error;
    }
    const outcome = await this.act(context, message, today, interpretation);
    const plan = planReply(outcome);
    const reply = await this.replies.compose({
      ...plan,
      userMessage: message.text,
      senderName: context.memberName,
    });
    return { reply, outcome };
  }

  private async act(
    context: RequestContext,
    message: IncomingMessage,
    today: IsoDate,
    interpretation: MessageInterpretation,
  ): Promise<Exclude<AssistantOutcome, { kind: 'AI_UNAVAILABLE' }>> {
    switch (interpretation.kind) {
      case 'TRANSACTION':
        return {
          kind: 'TRANSACTION',
          extraction: await this.extraction.extract({
            context,
            candidate: interpretation.transaction,
            today,
            medium: 'TEXT',
            ...(message.sourceMessageId === undefined
              ? {}
              : { sourceMessageId: message.sourceMessageId }),
          }),
        };
      case 'QUESTION':
        return {
          kind: 'QUESTION',
          query: await this.queries.answer(context, interpretation.question, today),
        };
      case 'OTHER':
        return { kind: 'OTHER' };
    }
  }

  private async buildInterpretationRequest(
    context: RequestContext,
    text: string,
    history: InterpretationRequest['history'],
  ): Promise<InterpretationRequest> {
    const [members, accounts, categories] = await Promise.all([
      this.households.listMembers(context.householdId),
      this.accounts.list(context.householdId),
      this.categories.list(),
    ]);
    return {
      message: text,
      history,
      senderName: context.memberName,
      memberNames: members.map((member) => member.name),
      accountNames: accounts.map((account) => account.name),
      categories: toCategoryOptions(categories),
    };
  }
}

function planReply(outcome: Exclude<AssistantOutcome, { kind: 'AI_UNAVAILABLE' }>): ReplyPlan {
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
    case 'OTHER':
      return 'other';
    case 'AI_UNAVAILABLE':
      return `ai-unavailable:${outcome.category}`;
  }
}
