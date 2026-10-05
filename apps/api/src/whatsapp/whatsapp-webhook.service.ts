import { Inject, Injectable, Logger } from '@nestjs/common';
import { InboundMessageDispatcher } from './inbound-message-dispatcher.js';
import { WebhookEventsRepository } from './webhook-events.repository.js';
import {
  WHATSAPP_PROVIDER,
  type InboundMessage,
  type WebhookRequest,
  type WhatsAppProvider,
} from './whatsapp-provider.js';

export class UnauthenticWebhookError extends Error {
  constructor() {
    super('Webhook request failed authentication');
    this.name = UnauthenticWebhookError.name;
  }
}

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    @Inject(WHATSAPP_PROVIDER) private readonly provider: WhatsAppProvider,
    private readonly events: WebhookEventsRepository,
    private readonly dispatcher: InboundMessageDispatcher,
  ) {}

  async accept(request: WebhookRequest, receivedAt: Date): Promise<void> {
    if (!this.provider.isAuthentic(request)) {
      this.logger.warn(`event=rejected reason=authentication provider=${this.provider.name}`);
      throw new UnauthenticWebhookError();
    }
    for (const message of this.provider.parseWebhook(request)) {
      await this.acceptMessage(message, receivedAt);
    }
  }

  private async acceptMessage(message: InboundMessage, receivedAt: Date): Promise<void> {
    if (await this.events.claim(this.provider.name, message.eventId)) {
      this.dispatcher.dispatch(message, receivedAt);
    } else {
      this.logger.log(`event=ignored reason=duplicate provider=${this.provider.name}`);
    }
  }
}
