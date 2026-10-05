import { Inject, Injectable } from '@nestjs/common';
import { AI_PROVIDER, AIProviderError, type AIProvider } from '../ai/ai-provider.js';
import { findUnverifiedFigures } from '../ai/reply/reply-guard.js';
import { APP_CONFIG, type AppConfig } from '../config/app-config.js';
import { PROACTIVE_POLICY } from './proactive-policy.js';

export interface NotificationContent {
  readonly type: string;
  readonly severity: string;
  readonly period: string;
  readonly title: string;
  readonly body: string;
}

export function plainMessage(content: NotificationContent): string {
  return `${content.title}\n${content.body}`;
}

@Injectable()
export class NotificationComposer {
  private readonly policy = PROACTIVE_POLICY;

  constructor(
    @Inject(AI_PROVIDER) private readonly provider: AIProvider,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async compose(content: NotificationContent, recipientName: string): Promise<string> {
    const fallback = plainMessage(content);
    if (!this.config.proactiveAiMessages) {
      return fallback;
    }
    const facts = {
      type: content.type,
      severity: content.severity,
      period: content.period,
      title: content.title,
      detail: content.body,
    };
    try {
      const written = (
        await this.provider.composeReply({
          situation: 'PROACTIVE_NOTIFICATION',
          userMessage: '',
          senderName: recipientName,
          facts,
        })
      ).trim();
      const isUsable =
        written !== '' &&
        written.length <= this.policy.maximumMessageLength &&
        findUnverifiedFigures(written, facts, '').length === 0;
      return isUsable ? written : fallback;
    } catch (error) {
      if (error instanceof AIProviderError) {
        return fallback;
      }
      throw error;
    }
  }
}
