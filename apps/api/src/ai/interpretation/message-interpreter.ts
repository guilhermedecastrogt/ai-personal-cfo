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
    const { kind, transaction, question } = parsed.data;
    if (kind === 'TRANSACTION' && transaction !== null) {
      return { kind, transaction };
    }
    if (kind === 'QUESTION' && question !== null) {
      return { kind, question };
    }
    if (kind === 'OTHER') {
      return { kind };
    }
    throw new AIProviderError('INVALID_RESPONSE');
  }
}
