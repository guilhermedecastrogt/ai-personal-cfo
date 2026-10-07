import {
  MalformedWebhookError,
  WhatsAppDeliveryError,
  type DeliveryFailure,
  type InboundMessage,
  type OutboundTemplate,
  type OutboundText,
  type WebhookRequest,
  type WhatsAppProvider,
} from '../whatsapp-provider.js';

export class FakeWhatsAppProvider implements WhatsAppProvider {
  readonly name = 'fake';
  readonly sent: OutboundText[] = [];
  readonly templates: OutboundTemplate[] = [];
  private failure: DeliveryFailure | undefined;

  willFailToSend(failure: DeliveryFailure): this {
    this.failure = failure;
    return this;
  }

  willSend(): this {
    this.failure = undefined;
    return this;
  }

  isAuthentic(request: WebhookRequest): boolean {
    return request.headers['x-fake-signature'] === 'valid';
  }

  parseWebhook(request: WebhookRequest): InboundMessage[] {
    try {
      return JSON.parse(request.rawBody.toString('utf8')) as InboundMessage[];
    } catch {
      throw new MalformedWebhookError();
    }
  }

  sendText(message: OutboundText): Promise<void> {
    if (this.failure !== undefined) {
      return Promise.reject(new WhatsAppDeliveryError(this.failure));
    }
    this.sent.push(message);
    return Promise.resolve();
  }

  sendTemplate(message: OutboundTemplate): Promise<void> {
    if (this.failure !== undefined) {
      return Promise.reject(new WhatsAppDeliveryError(this.failure));
    }
    this.templates.push(message);
    return Promise.resolve();
  }
}
