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
  CorrectionTarget,
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

export function transactionCandidate(
  overrides: Partial<TransactionCandidate> = {},
): TransactionCandidate {
  return {
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
  };
}

export function transactionsInterpretation(
  ...candidates: readonly Partial<TransactionCandidate>[]
): unknown {
  return {
    kind: 'TRANSACTION',
    question: null,
    completesPendingTransaction: false,
    transactions: candidates.map((overrides) => transactionCandidate(overrides)),
    correction: null,
  };
}

export function transactionInterpretation(overrides: Partial<TransactionCandidate> = {}): unknown {
  return transactionsInterpretation(overrides);
}

export function questionInterpretation(overrides: Partial<FinancialQuestion> = {}): unknown {
  return {
    kind: 'QUESTION',
    transactions: [],
    correction: null,
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
    transaction: transactionCandidate(overrides),
  };
}

export function completionOf(
  overrides: Partial<TransactionCandidate> = {},
  ...further: readonly Partial<TransactionCandidate>[]
): unknown {
  return {
    kind: 'TRANSACTION',
    question: null,
    correction: null,
    completesPendingTransaction: true,
    transactions: [
      {
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
      ...further.map((candidate) => transactionCandidate(candidate)),
    ],
  };
}

function bareInterpretation(kind: 'OTHER' | 'CORRECTION' | 'UNCLEAR'): unknown {
  return {
    kind,
    transactions: [],
    question: null,
    correction: null,
    completesPendingTransaction: false,
  };
}

export function correctionInterpretation(
  action: 'EDIT' | 'DELETE',
  target: Partial<CorrectionTarget> = {},
  changes: Partial<TransactionCandidate> = {},
): unknown {
  return {
    kind: 'CORRECTION',
    transactions: [],
    question: null,
    completesPendingTransaction: false,
    correction: {
      action,
      target: {
        ordinal: null,
        merchant: null,
        amount: null,
        member: null,
        date: UNSPECIFIED_DATE,
        ...target,
      },
      changes: {
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
        ...changes,
      },
    },
  };
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
