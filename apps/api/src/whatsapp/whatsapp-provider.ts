import type { MediaReference } from '../media/media-source.js';

export const WHATSAPP_PROVIDER = Symbol('WHATSAPP_PROVIDER');

export type InboundContent =
  | { readonly kind: 'TEXT'; readonly text: string }
  | { readonly kind: 'IMAGE'; readonly media: MediaReference; readonly caption?: string }
  | { readonly kind: 'UNSUPPORTED' };

export interface InboundMessage {
  readonly eventId: string;
  readonly deliveryId: string | undefined;
  readonly messageId: string;
  readonly sender: string;
  readonly sentAt: Date | undefined;
  readonly content: InboundContent;
}

export interface WebhookRequest {
  readonly rawBody: Buffer;
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

export interface OutboundText {
  readonly to: string;
  readonly text: string;
}

export interface OutboundTemplate {
  readonly to: string;
  readonly name: string;
  readonly language: string;
  readonly parameters: readonly string[];
}

export interface WhatsAppProvider {
  readonly name: string;
  isAuthentic(request: WebhookRequest): boolean;
  parseWebhook(request: WebhookRequest): InboundMessage[];
  sendText(message: OutboundText): Promise<void>;
  sendTemplate(message: OutboundTemplate): Promise<void>;
}

export class MalformedWebhookError extends Error {
  constructor() {
    super('Webhook payload is not in the expected format');
    this.name = MalformedWebhookError.name;
  }
}

export type DeliveryFailure = 'TIMEOUT' | 'UNAUTHORIZED' | 'REJECTED' | 'UNAVAILABLE';

export class WhatsAppDeliveryError extends Error {
  constructor(readonly failure: DeliveryFailure) {
    super(`WhatsApp message could not be sent: ${failure}`);
    this.name = WhatsAppDeliveryError.name;
  }
}
