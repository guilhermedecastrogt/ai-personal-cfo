import {
  AIProviderError,
  type AIFailureCategory,
  type AIProvider,
  type InterpretationRequest,
  type ReplyRequest,
} from '../ai-provider.js';
import type {
  DateReference,
  FinancialQuestion,
  PeriodReference,
  TransactionCandidate,
} from '../interpretation/message-interpretation.schema.js';

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
    transaction: {
      type: 'EXPENSE',
      amount: '23',
      currency: 'EUR',
      merchant: 'Lidl',
      description: null,
      category: 'Groceries',
      account: null,
      transferAccount: null,
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
    question: {
      intent: 'SPENDING_TOTAL',
      period: UNSPECIFIED_PERIOD,
      category: null,
      account: null,
      memberScope: 'HOUSEHOLD',
      memberName: null,
      ...overrides,
    },
  };
}

export const OTHER_INTERPRETATION: unknown = { kind: 'OTHER', transaction: null, question: null };

type ScriptedInterpretation =
  { readonly output: unknown } | { readonly failure: AIFailureCategory };

type ReplyScript = (request: ReplyRequest) => string;

export class FakeAIProvider implements AIProvider {
  readonly interpretationRequests: InterpretationRequest[] = [];
  readonly replyRequests: ReplyRequest[] = [];
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

  async composeReply(request: ReplyRequest): Promise<string> {
    this.replyRequests.push(request);
    return Promise.resolve(this.replyScript(request));
  }
}
