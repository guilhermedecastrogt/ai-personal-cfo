import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  AI_PROVIDER,
  AIProviderError,
  type AIProvider,
  type ReplyRequest,
} from '../ai-provider.js';
import { normalizeAssistantVoice } from '../voice.js';
import { renderFallbackReply } from './fallback-reply.js';
import { findUnverifiedFigures } from './reply-guard.js';

@Injectable()
export class ReplyComposer {
  private readonly logger = new Logger(ReplyComposer.name);

  constructor(@Inject(AI_PROVIDER) private readonly provider: AIProvider) {}

  async compose(request: ReplyRequest): Promise<string> {
    try {
      const reply = normalizeAssistantVoice(await this.provider.composeReply(request)).trim();
      if (reply === '') {
        return this.fallback(request, 'empty reply');
      }
      const unverified = findUnverifiedFigures(reply, request.facts, request.userMessage);
      return unverified.length === 0 ? reply : this.fallback(request, 'unverified figure');
    } catch (error) {
      if (error instanceof AIProviderError) {
        return this.fallback(request, error.category);
      }
      throw error;
    }
  }

  private fallback(request: ReplyRequest, reason: string): string {
    this.logger.warn(`Reply replaced by fallback: situation=${request.situation} reason=${reason}`);
    return renderFallbackReply(request.situation, request.facts, request.locale);
  }
}
