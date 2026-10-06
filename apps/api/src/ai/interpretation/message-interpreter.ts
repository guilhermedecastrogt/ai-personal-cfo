import { Inject, Injectable } from '@nestjs/common';
import {
  AI_PROVIDER,
  AIProviderError,
  type AIProvider,
  type InterpretationRequest,
} from '../ai-provider.js';
import {
  messageInterpretationWireSchema,
  type MessageInterpretation,
} from './message-interpretation.schema.js';

@Injectable()
export class MessageInterpreter {
  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  async interpret(request: InterpretationRequest): Promise<MessageInterpretation> {
    const parsed = messageInterpretationWireSchema.safeParse(
      await this.provider.interpretMessage(request),
    );
    if (!parsed.success) {
      throw new AIProviderError('INVALID_RESPONSE');
    }
    const { kind, transactions, question } = parsed.data;
    if (kind === 'TRANSACTION') {
      const [first, ...rest] = transactions;
      return first === undefined
        ? { kind: 'UNCLEAR' }
        : {
            kind,
            transactions: [first, ...rest],
            completesPending: parsed.data.completesPendingTransaction,
          };
    }
    if (kind === 'QUESTION' && question !== null) {
      return { kind, question };
    }
    if (kind === 'CORRECTION') {
      const { correction } = parsed.data;
      return correction === null ? { kind: 'UNCLEAR' } : { kind, correction };
    }
    if (kind === 'GOAL_CONTRIBUTION') {
      const { contribution } = parsed.data;
      return contribution === null ? { kind: 'UNCLEAR' } : { kind, contribution };
    }
    if (kind === 'OTHER' || kind === 'UNCLEAR') {
      return { kind };
    }
    throw new AIProviderError('INVALID_RESPONSE');
  }
}
