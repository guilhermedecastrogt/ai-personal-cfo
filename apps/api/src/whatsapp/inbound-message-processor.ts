import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  FinancialAssistant,
  type AssistantResponse,
} from '../conversation/financial-assistant.service.js';
import type { RequestContext } from '../households/request-context.js';
import { RateLimiter } from '../security/rate-limiter.js';
import { SECURITY_POLICY_TOKEN, type SecurityPolicy } from '../security/security-policy.js';
import { WhatsAppIdentityResolver } from '../households/whatsapp-identity-resolver.js';
import { WebhookEventsRepository, type WebhookEventOutcome } from './webhook-events.repository.js';
import {
  WHATSAPP_PROVIDER,
  WhatsAppDeliveryError,
  type InboundMessage,
  type WhatsAppProvider,
} from './whatsapp-provider.js';

export const SLOW_DOWN_REPLY =
  'You are sending messages faster than I can handle. Please wait a minute and try again.';

export const PROCESSING_FAILED_REPLY =
  'Something went wrong on my side and I could not process that. Please try again in a moment.';

type SupportedMessage = InboundMessage & {
  readonly content: Exclude<InboundMessage['content'], { kind: 'UNSUPPORTED' }>;
};

@Injectable()
export class InboundMessageProcessor {
  private readonly logger = new Logger(InboundMessageProcessor.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly identities: WhatsAppIdentityResolver,
    private readonly assistant: FinancialAssistant,
    private readonly events: WebhookEventsRepository,
    private readonly limiter: RateLimiter,
    @Inject(SECURITY_POLICY_TOKEN) private readonly policy: SecurityPolicy,
  ) {}

  async process(message: InboundMessage, receivedAt: Date): Promise<void> {
    try {
      const outcome = await this.handle(message, receivedAt);
      await this.finish(message, outcome);
    } catch {
      await this.recover(message);
    }
  }

  private async handle(message: InboundMessage, receivedAt: Date): Promise<WebhookEventOutcome> {
    const context = await this.identities.resolve(this.provider.name, message.sender);
    if (context === undefined) {
      this.logger.warn(`event=ignored reason=unknown-sender provider=${this.provider.name}`);
      return 'IGNORED';
    }
    if (!isSupported(message)) {
      this.logger.log(`event=ignored reason=unsupported-message provider=${this.provider.name}`);
      return 'IGNORED';
    }
    const kind = message.content.kind === 'IMAGE' ? 'image' : 'text';
    const allowance = this.limiter.consume(
      `MESSAGE:${kind}:${context.memberId}`,
      this.policy.inboundMessages[kind],
      receivedAt,
    );
    if (!allowance.isAllowed) {
      this.logger.warn(`event=ignored reason=rate-limited provider=${this.provider.name}`);
      if (allowance.isFirstRejection) {
        await this.reply(message.sender, SLOW_DOWN_REPLY);
      }
      return 'IGNORED';
    }
    const response = await this.respond(context, message, instantOf(message, receivedAt));
    await this.reply(message.sender, response.reply);
    return 'PROCESSED';
  }

  private async respond(
    context: RequestContext,
    message: SupportedMessage,
    instant: Date,
  ): Promise<AssistantResponse> {
    const { content, messageId } = message;
    if (content.kind === 'TEXT') {
      return this.assistant.handle(
        context,
        { text: content.text, sourceMessageId: messageId },
        instant,
      );
    }
    return this.assistant.handleImage(
      context,
      {
        media: content.media,
        sourceMessageId: messageId,
        ...(content.caption === undefined ? {} : { caption: content.caption }),
      },
      instant,
    );
  }

  private async reply(to: string, text: string): Promise<void> {
    try {
      await this.provider.sendText({ to, text });
    } catch (error) {
      const failure = error instanceof WhatsAppDeliveryError ? error.failure : 'UNEXPECTED';
      this.logger.error(`event=reply-failed provider=${this.provider.name} failure=${failure}`);
    }
  }

  private async finish(message: InboundMessage, outcome: WebhookEventOutcome): Promise<void> {
    await this.events.complete(this.provider.name, message.eventId, outcome);
    this.logger.log(`event=completed provider=${this.provider.name} outcome=${outcome}`);
  }

  private async recover(message: InboundMessage): Promise<void> {
    this.logger.error(`event=failed provider=${this.provider.name}`);
    try {
      await this.events.complete(this.provider.name, message.eventId, 'FAILED');
    } catch {
      this.logger.error(`event=failure-not-recorded provider=${this.provider.name}`);
    }
    await this.reply(message.sender, PROCESSING_FAILED_REPLY);
  }
}

function isSupported(message: InboundMessage): message is SupportedMessage {
  return message.content.kind !== 'UNSUPPORTED';
}

function instantOf(message: InboundMessage, receivedAt: Date): Date {
  const { sentAt } = message;
  return sentAt !== undefined && sentAt <= receivedAt ? sentAt : receivedAt;
}
