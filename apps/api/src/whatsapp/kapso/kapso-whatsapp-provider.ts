import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  MalformedWebhookError,
  WhatsAppDeliveryError,
  type DeliveryFailure,
  type InboundContent,
  type InboundMessage,
  type OutboundText,
  type WebhookRequest,
  type WhatsAppProvider,
} from '../whatsapp-provider.js';
import { KAPSO_PROVIDER_NAME, endpoint, timeoutOf, type KapsoOptions } from './kapso-options.js';
import {
  MESSAGE_RECEIVED_EVENT,
  kapsoBatchSchema,
  kapsoMessageEventSchema,
  type KapsoMessageEvent,
} from './kapso-webhook.schema.js';

const SIGNATURE_HEADER = 'x-webhook-signature';
const EVENT_HEADER = 'x-webhook-event';
const IDEMPOTENCY_HEADER = 'x-idempotency-key';
const HEX_SIGNATURE = /^[0-9a-f]{64}$/i;
const MAXIMUM_TEXT_LENGTH = 4096;
const MILLISECONDS_PER_SECOND = 1000;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_SERVER_ERROR = 500;

export class KapsoWhatsAppProvider implements WhatsAppProvider {
  readonly name = KAPSO_PROVIDER_NAME;

  constructor(private readonly options: KapsoOptions) {}

  isAuthentic(request: WebhookRequest): boolean {
    const signature = headerOf(request, SIGNATURE_HEADER);
    if (signature === undefined || !HEX_SIGNATURE.test(signature)) {
      return false;
    }
    const expected = createHmac('sha256', this.options.webhookSecret)
      .update(request.rawBody)
      .digest();
    return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
  }

  parseWebhook(request: WebhookRequest): InboundMessage[] {
    const body = parseJson(request.rawBody);
    const batch = kapsoBatchSchema.safeParse(body);
    const eventName = batch.success ? batch.data.type : headerOf(request, EVENT_HEADER);
    if (eventName === undefined) {
      throw new MalformedWebhookError();
    }
    if (eventName !== MESSAGE_RECEIVED_EVENT) {
      return [];
    }
    const deliveryId = headerOf(request, IDEMPOTENCY_HEADER);
    return (batch.success ? batch.data.data : [body])
      .map(parseEvent)
      .filter((event) => this.isAddressedToThisNumber(event) && isInbound(event))
      .map((event) => toInboundMessage(event, deliveryId));
  }

  async sendText(message: OutboundText): Promise<void> {
    const response = await this.post(`${this.options.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: message.to,
      type: 'text',
      text: { body: message.text.slice(0, MAXIMUM_TEXT_LENGTH), preview_url: false },
    });
    if (!response.ok) {
      throw new WhatsAppDeliveryError(failureOf(response.status));
    }
  }

  private async post(path: string, body: unknown): Promise<Response> {
    try {
      return await fetch(endpoint(this.options, path), {
        method: 'POST',
        headers: { 'X-API-Key': this.options.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutOf(this.options),
        redirect: 'error',
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new WhatsAppDeliveryError(timedOut ? 'TIMEOUT' : 'UNAVAILABLE');
    }
  }

  private isAddressedToThisNumber(event: KapsoMessageEvent): boolean {
    return (
      event.phone_number_id === undefined || event.phone_number_id === this.options.phoneNumberId
    );
  }
}

function headerOf(request: WebhookRequest, name: string): string | undefined {
  const value = request.headers[name];
  const text = Array.isArray(value) ? value[0] : value;
  return text === undefined || text.trim() === '' ? undefined : text.trim();
}

function parseJson(rawBody: Buffer): unknown {
  try {
    return JSON.parse(rawBody.toString('utf8')) as unknown;
  } catch {
    throw new MalformedWebhookError();
  }
}

function parseEvent(candidate: unknown): KapsoMessageEvent {
  const parsed = kapsoMessageEventSchema.safeParse(candidate);
  if (!parsed.success) {
    throw new MalformedWebhookError();
  }
  return parsed.data;
}

function isInbound(event: KapsoMessageEvent): boolean {
  const direction = event.message.kapso?.direction;
  return direction === undefined || direction === 'inbound';
}

function toInboundMessage(
  event: KapsoMessageEvent,
  deliveryId: string | undefined,
): InboundMessage {
  const { message } = event;
  const sender = (message.from ?? event.conversation?.phone_number ?? '').replace(/\D/g, '');
  if (sender === '') {
    throw new MalformedWebhookError();
  }
  return {
    eventId: `${MESSAGE_RECEIVED_EVENT}:${message.id}`,
    deliveryId,
    messageId: message.id,
    sender,
    sentAt: toDate(message.timestamp),
    content: toContent(message),
  };
}

function toContent(message: KapsoMessageEvent['message']): InboundContent {
  if (message.type === 'text') {
    if (message.text === undefined) {
      throw new MalformedWebhookError();
    }
    return { kind: 'TEXT', text: message.text.body };
  }
  if (message.type === 'image') {
    if (message.image === undefined) {
      throw new MalformedWebhookError();
    }
    const caption = message.image.caption?.trim() ?? '';
    return {
      kind: 'IMAGE',
      media: { provider: KAPSO_PROVIDER_NAME, mediaId: message.image.id },
      ...(caption === '' ? {} : { caption }),
    };
  }
  return { kind: 'UNSUPPORTED' };
}

function toDate(timestamp: string | undefined): Date | undefined {
  const seconds = Number(timestamp);
  return timestamp === undefined || !Number.isSafeInteger(seconds) || seconds <= 0
    ? undefined
    : new Date(seconds * MILLISECONDS_PER_SECOND);
}

function failureOf(status: number): DeliveryFailure {
  if (status === HTTP_UNAUTHORIZED || status === HTTP_FORBIDDEN) {
    return 'UNAUTHORIZED';
  }
  return status >= HTTP_SERVER_ERROR ? 'UNAVAILABLE' : 'REJECTED';
}
