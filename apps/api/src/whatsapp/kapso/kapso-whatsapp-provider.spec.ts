import { MalformedWebhookError, WhatsAppDeliveryError } from '../whatsapp-provider.js';
import {
  KAPSO_TEST_API_KEY,
  KAPSO_TEST_PHONE_NUMBER_ID,
  KAPSO_TEST_SECRET,
  KapsoApiStub,
  kapsoEventOfType,
  kapsoImageEvent,
  kapsoTextEvent,
  signKapsoBody,
} from '../testing/kapso-api-stub.fixture.js';
import { KapsoWhatsAppProvider } from './kapso-whatsapp-provider.js';

const SENDER = { id: 'wamid.123', from: '353850000001' };

describe('KapsoWhatsAppProvider', () => {
  const stub = new KapsoApiStub();

  function provider(
    overrides: { requestTimeoutInMilliseconds?: number; apiBaseUrl?: string } = {},
  ): KapsoWhatsAppProvider {
    return new KapsoWhatsAppProvider({
      apiKey: KAPSO_TEST_API_KEY,
      webhookSecret: KAPSO_TEST_SECRET,
      phoneNumberId: KAPSO_TEST_PHONE_NUMBER_ID,
      apiBaseUrl: stub.baseUrl,
      ...overrides,
    });
  }

  function request(
    payload: unknown,
    headers: Record<string, string | undefined> = {},
  ): { rawBody: Buffer; headers: Record<string, string | undefined> } {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    return {
      rawBody: Buffer.from(body),
      headers: {
        'x-webhook-event': 'whatsapp.message.received',
        'x-webhook-signature': signKapsoBody(body),
        'x-idempotency-key': 'delivery-1',
        'x-webhook-payload-version': 'v2',
        ...headers,
      },
    };
  }

  beforeAll(() => stub.start());
  afterAll(() => stub.stop());
  beforeEach(() => {
    stub.reset();
  });

  it('identifies itself as kapso', () => {
    expect(provider().name).toBe('kapso');
  });

  describe('webhook authentication', () => {
    const payload = kapsoTextEvent(SENDER, 'Gastei €23 no Lidl');

    it('accepts a body signed with the webhook secret', () => {
      expect(provider().isAuthentic(request(payload))).toBe(true);
    });

    it('accepts the signature in upper case', () => {
      const signed = request(payload);
      const signature = signed.headers['x-webhook-signature']?.toUpperCase();

      expect(provider().isAuthentic(request(payload, { 'x-webhook-signature': signature }))).toBe(
        true,
      );
    });

    it.each([
      ['a missing signature', undefined],
      ['an empty signature', ''],
      [
        'a signature made with another secret',
        signKapsoBody(JSON.stringify(payload), 'wrong-secret'),
      ],
      ['a truncated signature', signKapsoBody(JSON.stringify(payload)).slice(0, 40)],
      ['a signature that is not hexadecimal', 'z'.repeat(64)],
      ['a prefixed signature', `sha256=${signKapsoBody(JSON.stringify(payload))}`],
    ])('rejects %s', (_description, signature) => {
      expect(provider().isAuthentic(request(payload, { 'x-webhook-signature': signature }))).toBe(
        false,
      );
    });

    it('rejects a body that was altered after signing', () => {
      const signed = request(payload);
      const tampered = {
        ...signed,
        rawBody: Buffer.from(JSON.stringify(kapsoTextEvent(SENDER, 'Gastei €9999'))),
      };

      expect(provider().isAuthentic(tampered)).toBe(false);
    });

    it('verifies the exact bytes received, not a re-serialised body', () => {
      const spaced = JSON.stringify(payload, null, 2);

      expect(provider().isAuthentic(request(spaced))).toBe(true);
      expect(
        provider().isAuthentic(
          request(spaced, { 'x-webhook-signature': signKapsoBody(JSON.stringify(payload)) }),
        ),
      ).toBe(false);
    });
  });

  describe('normalising inbound messages', () => {
    it('turns a text event into an internal text message', () => {
      expect(
        provider().parseWebhook(request(kapsoTextEvent(SENDER, 'Gastei €23 no Lidl'))),
      ).toEqual([
        {
          eventId: 'whatsapp.message.received:wamid.123',
          deliveryId: 'delivery-1',
          messageId: 'wamid.123',
          sender: '353850000001',
          sentAt: new Date(1792584000 * 1000),
          content: { kind: 'TEXT', text: 'Gastei €23 no Lidl' },
        },
      ]);
    });

    it('turns an image event into an opaque media reference with its caption', () => {
      const [message] = provider().parseWebhook(
        request(kapsoImageEvent(SENDER, 'media_id_123', 'almoço')),
      );

      expect(message?.content).toEqual({
        kind: 'IMAGE',
        media: { provider: 'kapso', mediaId: 'media_id_123' },
        caption: 'almoço',
      });
    });

    it('carries no provider address for an image, only the media identifier', () => {
      const messages = provider().parseWebhook(request(kapsoImageEvent(SENDER, 'media_id_123')));

      expect(JSON.stringify(messages)).not.toMatch(/https?:/);
      expect(messages[0]?.content).toEqual({
        kind: 'IMAGE',
        media: { provider: 'kapso', mediaId: 'media_id_123' },
      });
    });

    it('keeps nothing else from the provider payload', () => {
      const [message] = provider().parseWebhook(request(kapsoTextEvent(SENDER, 'Olá')));

      expect(Object.keys(message ?? {}).sort()).toEqual([
        'content',
        'deliveryId',
        'eventId',
        'messageId',
        'sender',
        'sentAt',
      ]);
    });

    it('reduces the sender to digits whatever the formatting', () => {
      const [message] = provider().parseWebhook(
        request(kapsoTextEvent({ ...SENDER, from: '+353 (85) 000-0001' }, 'Olá')),
      );

      expect(message?.sender).toBe('353850000001');
    });

    it('falls back to the conversation phone number when the message has no sender', () => {
      const event = kapsoTextEvent(SENDER, 'Olá') as { message: Record<string, unknown> };
      delete event.message.from;

      expect(provider().parseWebhook(request(event))[0]?.sender).toBe('353850000001');
    });

    it.each(['audio', 'video', 'document', 'sticker', 'location', 'reaction'])(
      'marks a %s message as unsupported',
      (type) => {
        const [message] = provider().parseWebhook(request(kapsoEventOfType(SENDER, type)));

        expect(message?.content).toEqual({ kind: 'UNSUPPORTED' });
      },
    );

    it.each([
      'whatsapp.message.sent',
      'whatsapp.message.delivered',
      'whatsapp.message.read',
      'whatsapp.conversation.created',
    ])('ignores the %s event', (event) => {
      expect(
        provider().parseWebhook(
          request(kapsoTextEvent(SENDER, 'Olá'), { 'x-webhook-event': event }),
        ),
      ).toEqual([]);
    });

    it('ignores a message addressed to another business number', () => {
      const event = kapsoTextEvent({ ...SENDER, phoneNumberId: '999999999999999' }, 'Olá');

      expect(provider().parseWebhook(request(event))).toEqual([]);
    });

    it('ignores a message that is not inbound', () => {
      const event = kapsoTextEvent(SENDER, 'Olá') as { message: { kapso: { direction: string } } };
      event.message.kapso.direction = 'outbound';

      expect(provider().parseWebhook(request(event))).toEqual([]);
    });

    it('reads every message of a batched delivery', () => {
      const batch = {
        type: 'whatsapp.message.received',
        batch: true,
        data: [
          kapsoTextEvent({ id: 'wamid.111', from: '353850000001' }, 'First'),
          kapsoTextEvent({ id: 'wamid.112', from: '353850000001' }, 'Second'),
        ],
        batch_info: { size: 2 },
      };

      const messages = provider().parseWebhook(request(batch, { 'x-webhook-event': undefined }));

      expect(messages.map((message) => message.eventId)).toEqual([
        'whatsapp.message.received:wamid.111',
        'whatsapp.message.received:wamid.112',
      ]);
    });

    it('gives a message the same event identity whichever delivery carries it', () => {
      const event = kapsoTextEvent(SENDER, 'Olá');
      const single = provider().parseWebhook(request(event, { 'x-idempotency-key': 'first-key' }));
      const redelivered = provider().parseWebhook(
        request(event, { 'x-idempotency-key': 'second-key' }),
      );

      expect(single[0]?.eventId).toBe(redelivered[0]?.eventId);
      expect(redelivered[0]?.deliveryId).toBe('second-key');
    });

    it('has no sent time when the timestamp is absent or not a number', () => {
      const [message] = provider().parseWebhook(
        request(kapsoTextEvent({ ...SENDER, timestamp: 'soon' }, 'Olá')),
      );

      expect(message?.sentAt).toBeUndefined();
    });

    it.each([
      ['a body that is not JSON', 'not json'],
      ['a body without a message', { conversation: {} }],
      [
        'a message without an identifier',
        { message: { type: 'text', from: '1', text: { body: 'x' } } },
      ],
      ['a text message without text', { message: { id: 'wamid.1', type: 'text', from: '1' } }],
      ['an image message without media', { message: { id: 'wamid.1', type: 'image', from: '1' } }],
      [
        'a message without a sender',
        { message: { id: 'wamid.1', type: 'text', text: { body: 'x' } } },
      ],
      [
        'a batch with a malformed item',
        { type: 'whatsapp.message.received', batch: true, data: [{}] },
      ],
    ])('rejects %s as malformed', (_description, payload) => {
      expect(() => provider().parseWebhook(request(payload))).toThrow(MalformedWebhookError);
    });

    it('rejects a delivery that does not say which event it carries', () => {
      const unnamed = request(kapsoTextEvent(SENDER, 'Olá'), { 'x-webhook-event': undefined });

      expect(() => provider().parseWebhook(unnamed)).toThrow(MalformedWebhookError);
    });
  });

  describe('sending a template', () => {
    it('posts an approved template with its language and body parameters', async () => {
      await provider().sendTemplate({
        to: '5511999990001',
        name: 'boas_vindas',
        language: 'pt_BR',
        parameters: ['Beatriz', 'Família Castro'],
      });

      expect(stub.requests).toEqual([
        {
          method: 'POST',
          path: `/meta/whatsapp/v24.0/${KAPSO_TEST_PHONE_NUMBER_ID}/messages`,
          apiKey: KAPSO_TEST_API_KEY,
          body: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '5511999990001',
            type: 'template',
            template: {
              name: 'boas_vindas',
              language: { code: 'pt_BR' },
              components: [
                {
                  type: 'body',
                  parameters: [
                    { type: 'text', text: 'Beatriz' },
                    { type: 'text', text: 'Família Castro' },
                  ],
                },
              ],
            },
          },
        },
      ]);
    });

    it('reports a template the provider refuses', async () => {
      stub.sendStatus = 400;

      await expect(
        provider().sendTemplate({ to: '1', name: 'missing', language: 'en', parameters: [] }),
      ).rejects.toMatchObject({ failure: 'REJECTED' });
    });
  });

  describe('sending text', () => {
    it('posts the message to the configured number with the API key', async () => {
      await provider().sendText({ to: '353850000001', text: 'Registado.' });

      expect(stub.requests).toEqual([
        {
          method: 'POST',
          path: `/meta/whatsapp/v24.0/${KAPSO_TEST_PHONE_NUMBER_ID}/messages`,
          apiKey: KAPSO_TEST_API_KEY,
          body: {
            messaging_product: 'whatsapp',
            recipient_type: 'individual',
            to: '353850000001',
            type: 'text',
            text: { body: 'Registado.', preview_url: false },
          },
        },
      ]);
    });

    it('shortens a text beyond what WhatsApp accepts', async () => {
      await provider().sendText({ to: '353850000001', text: 'a'.repeat(5000) });

      const body = stub.requests[0]?.body as { text: { body: string } };
      expect(body.text.body).toHaveLength(4096);
    });

    it.each([
      [401, 'UNAUTHORIZED'],
      [403, 'UNAUTHORIZED'],
      [400, 'REJECTED'],
      [422, 'REJECTED'],
      [500, 'UNAVAILABLE'],
      [503, 'UNAVAILABLE'],
    ])('reports HTTP %d as %s', async (status, failure) => {
      stub.sendStatus = status;

      await expect(provider().sendText({ to: '353850000001', text: 'x' })).rejects.toMatchObject({
        failure,
      });
    });

    it('reports an unreachable API as unavailable without exposing the key', async () => {
      const unreachable = provider({ apiBaseUrl: 'http://127.0.0.1:1/meta/whatsapp/v24.0' });

      const error = (await unreachable
        .sendText({ to: '353850000001', text: 'saldo €500' })
        .catch((caught: unknown) => caught)) as Error;

      expect(error).toBeInstanceOf(WhatsAppDeliveryError);
      expect(error).toMatchObject({ failure: 'UNAVAILABLE' });
      expect(`${error.message}${JSON.stringify(error)}`).not.toContain(KAPSO_TEST_API_KEY);
      expect(`${error.message}${JSON.stringify(error)}`).not.toContain('500');
    });

    it('sends each message once and does not retry a failure', async () => {
      stub.sendStatus = 500;

      await provider()
        .sendText({ to: '353850000001', text: 'x' })
        .catch(() => undefined);

      expect(stub.requests).toHaveLength(1);
    });
  });
});
