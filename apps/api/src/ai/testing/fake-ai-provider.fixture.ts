import {
  AIProviderError,
  type AIFailureCategory,
  type AIProvider,
  type ImageExtractionRequest,
  type InterpretationRequest,
  type ReplyRequest,
  type ReviewExplanationRequest,
} from '../ai-provider.js';
import type {
  DateReference,
  FinancialQuestion,
  PeriodReference,
  TransactionCandidate,
} from '../interpretation/message-interpretation.schema.js';

export const EMPTY_CONVERSATION = {
  recentUserMessages: [],
  lastOutcome: 'NONE',
  previousQuestion: null,
  pendingTransaction: null,
};

export const UNSPECIFIED_DATE: DateReference = {
  kind: 'UNSPECIFIED',
  daysAgo: null,
  weekday: null,
  dayOfMonth: null,
  isoDate: null,
};

export const UNSPECIFIED_PERIOD: PeriodReference = {
  kind: 'UNSPECIFIED',
  days: null,
  year: null,
  month: null,
};

export function transactionInterpretation(overrides: Partial<TransactionCandidate> = {}): unknown {
  return {
    kind: 'TRANSACTION',
    question: null,
    completesPendingTransaction: false,
    transaction: {
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
    },
  };
}

export function questionInterpretation(overrides: Partial<FinancialQuestion> = {}): unknown {
  return {
    kind: 'QUESTION',
    transaction: null,
    completesPendingTransaction: false,
    question: {
      intent: 'SPENDING_TOTAL',
      period: UNSPECIFIED_PERIOD,
      category: null,
      account: null,
      memberScope: 'HOUSEHOLD',
      memberName: null,
      inheritFromPrevious: [],
      ...overrides,
    },
  };
}

export function imageReading(overrides: Partial<TransactionCandidate> = {}): unknown {
  return {
    kind: 'SINGLE_TRANSACTION',
    transactionCount: null,
    transaction: (transactionInterpretation(overrides) as { transaction: unknown }).transaction,
  };
}

export function completionOf(overrides: Partial<TransactionCandidate> = {}): unknown {
  return {
    kind: 'TRANSACTION',
    question: null,
    completesPendingTransaction: true,
    transaction: {
      type: null,
      amount: null,
      currency: null,
      merchant: null,
      description: null,
      category: null,
      account: null,
      transferAccount: null,
      member: null,
      memberReference: 'SENDER',
      paymentMethod: null,
      date: UNSPECIFIED_DATE,
      confidence: 0.95,
      ...overrides,
    },
  };
}

function bareInterpretation(kind: 'OTHER' | 'CORRECTION' | 'UNCLEAR'): unknown {
  return { kind, transaction: null, question: null, completesPendingTransaction: false };
}

export const OTHER_INTERPRETATION = bareInterpretation('OTHER');
export const CORRECTION_INTERPRETATION = bareInterpretation('CORRECTION');
export const UNCLEAR_INTERPRETATION = bareInterpretation('UNCLEAR');

type ScriptedInterpretation =
  { readonly output: unknown } | { readonly failure: AIFailureCategory };

type ReplyScript = (request: ReplyRequest) => string;

export class FakeAIProvider implements AIProvider {
  readonly interpretationRequests: InterpretationRequest[] = [];
  readonly replyRequests: ReplyRequest[] = [];
  readonly imageRequests: ImageExtractionRequest[] = [];
  private imageReadings: ScriptedInterpretation[] = [];
  readonly reviewRequests: ReviewExplanationRequest[] = [];
  private reviewExplanation: ScriptedInterpretation = { failure: 'UNAVAILABLE' };
  private interpretations: ScriptedInterpretation[] = [];
  private replyScript: ReplyScript = (request) => `[${request.situation}]`;

  willInterpretAs(...outputs: unknown[]): this {
    this.interpretations = outputs.map((output) => ({ output }));
    return this;
  }

  willFailToInterpret(failure: AIFailureCategory): this {
    this.interpretations = [{ failure }];
    return this;
  }

  willReadImageAs(...outputs: unknown[]): this {
    this.imageReadings = outputs.map((output) => ({ output }));
    return this;
  }

  willFailToReadImage(failure: AIFailureCategory): this {
    this.imageReadings = [{ failure }];
    return this;
  }

  willExplainReviewAs(output: unknown): this {
    this.reviewExplanation = { output };
    return this;
  }

  willFailToExplainReview(failure: AIFailureCategory): this {
    this.reviewExplanation = { failure };
    return this;
  }

  willReply(reply: string | ReplyScript): this {
    this.replyScript = typeof reply === 'function' ? reply : (): string => reply;
    return this;
  }

  willFailToReply(failure: AIFailureCategory): this {
    this.replyScript = (): string => {
      throw new AIProviderError(failure);
    };
    return this;
  }

  interpretMessage(request: InterpretationRequest): Promise<unknown> {
    this.interpretationRequests.push(request);
    const next = this.interpretations.shift();
    if (next === undefined) {
      return Promise.reject(new Error('The fake provider has no interpretation scripted'));
    }
    return 'failure' in next
      ? Promise.reject(new AIProviderError(next.failure))
      : Promise.resolve(next.output);
  }

  extractTransactionFromImage(request: ImageExtractionRequest): Promise<unknown> {
    this.imageRequests.push(request);
    const next = this.imageReadings.shift();
    if (next === undefined) {
      return Promise.reject(new Error('The fake provider has no image reading scripted'));
    }
    return 'failure' in next
      ? Promise.reject(new AIProviderError(next.failure))
      : Promise.resolve(next.output);
  }

  explainMonthlyReview(request: ReviewExplanationRequest): Promise<unknown> {
    this.reviewRequests.push(request);
    const scripted = this.reviewExplanation;
    return 'failure' in scripted
      ? Promise.reject(new AIProviderError(scripted.failure))
      : Promise.resolve(scripted.output);
  }

  async composeReply(request: ReplyRequest): Promise<string> {
    this.replyRequests.push(request);
    return Promise.resolve(this.replyScript(request));
  }
}
