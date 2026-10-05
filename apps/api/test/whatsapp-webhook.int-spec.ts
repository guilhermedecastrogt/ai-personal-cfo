import { readdir } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication, LoggerService } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import {
  FakeAIProvider,
  imageReading,
  questionInterpretation,
  transactionInterpretation,
} from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { APP_CONFIG, type AppConfig } from '../src/config/app-config.js';
import { aiMessages } from '../src/conversation/conversations.schema.js';
import { HouseholdsRepository } from '../src/households/households.repository.js';
import { jpegImage } from '../src/media/testing/fake-media-source.fixture.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { InboundMessageDispatcher } from '../src/whatsapp/inbound-message-dispatcher.js';
import { PROCESSING_FAILED_REPLY } from '../src/whatsapp/inbound-message-processor.js';
import {
  KAPSO_TEST_API_KEY,
  KAPSO_TEST_PHONE_NUMBER_ID,
  KAPSO_TEST_SECRET,
  KapsoApiStub,
  kapsoEventOfType,
  kapsoImageEvent,
  kapsoTextEvent,
  signKapsoBody,
} from '../src/whatsapp/testing/kapso-api-stub.fixture.js';
import { webhookEvents } from '../src/whatsapp/webhook-events.schema.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const MESSAGE_TEXT = 'Gastei €23 no Lidl';

class CapturingLogger implements LoggerService {
  readonly lines: string[] = [];

  log(...parts: unknown[]): void {
    this.capture(parts);
  }

  warn(...parts: unknown[]): void {
    this.capture(parts);
  }

  error(...parts: unknown[]): void {
    this.capture(parts);
  }

  private capture(parts: unknown[]): void {
    this.lines.push(
      parts
        .map((part) =>
          part instanceof Error ? `${part.message} ${String(part.stack)}` : JSON.stringify(part),
        )
        .join(' '),
    );
  }
}

interface Posted {
  readonly status: number;
  readonly body: unknown;
}

describe('WhatsApp webhook', () => {
  const kapso = new KapsoApiStub();
  const logger = new CapturingLogger();
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let ai: FakeAIProvider;
  let dispatcher: InboundMessageDispatcher;
  let households: HouseholdsRepository;
  let accounts: AccountsRepository;
  let phoneSequence = 0;
  let messageSequence = 0;

  function nextMessageId(): string {
    messageSequence += 1;
    return `wamid.test-${String(messageSequence)}`;
  }

  async function householdWithSenders(
    name: string,
    memberCount = 1,
  ): Promise<{
    fixture: HouseholdFixture;
    phones: string[];
  }> {
    const fixture = await createHouseholdFixture(testDatabase.database, name, memberCount);
    const phones: string[] = [];
    for (const member of fixture.members) {
      phoneSequence += 1;
      const phone = `3538500${String(phoneSequence).padStart(5, '0')}`;
      phones.push(phone);
      await households.registerWhatsAppIdentity(fixture.household.id, {
        memberId: member.id,
        provider: 'kapso',
        externalUserId: phone,
        phoneNumber: `+${phone}`,
      });
      await accounts.setDefaultAccount(fixture.household.id, member.id, fixture.jointAccount.id);
    }
    return { fixture, phones };
  }

  async function post(payload: unknown, headers: Record<string, string> = {}): Promise<Posted> {
    const body = typeof payload === 'string' ? payload : JSON.stringify(payload);
    const response = await request(app.getHttpServer())
      .post('/webhooks/whatsapp')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Event', 'whatsapp.message.received')
      .set('X-Webhook-Payload-Version', 'v2')
      .set('X-Idempotency-Key', `delivery-${String(Math.random())}`)
      .set('X-Webhook-Signature', signKapsoBody(body))
      .set(headers)
      .send(body);
    return { status: response.status, body: response.body as unknown };
  }

  async function deliver(payload: unknown, headers: Record<string, string> = {}): Promise<Posted> {
    const posted = await post(payload, headers);
    await dispatcher.whenIdle();
    return posted;
  }

  async function transactionsOf(
    fixture: HouseholdFixture,
  ): Promise<(typeof transactions.$inferSelect)[]> {
    return testDatabase.database
      .select()
      .from(transactions)
      .where(eq(transactions.householdId, fixture.household.id));
  }

  async function eventStatus(messageId: string): Promise<string | undefined> {
    const [event] = await testDatabase.database
      .select()
      .from(webhookEvents)
      .where(eq(webhookEvents.externalEventId, `whatsapp.message.received:${messageId}`));
    return event?.status;
  }

  function repliesTo(phone: string): string[] {
    return kapso.sentMessages
      .map((sent) => sent.body as { to: string; text: { body: string } })
      .filter((body) => body.to === phone)
      .map((body) => body.text.body);
  }

  beforeAll(async () => {
    await kapso.start();
    testDatabase = await createTestDatabase();
    ai = new FakeAIProvider();
    const config: AppConfig = {
      environment: 'test',
      port: 0,
      logLevel: 'debug',
      databaseUrl: testDatabase.url,
      openaiApiKey: 'sk-test-openai-secret',
      openaiModel: 'unused',
      aiConfidenceThreshold: 0.8,
      kapsoApiKey: KAPSO_TEST_API_KEY,
      kapsoWebhookSecret: KAPSO_TEST_SECRET,
      kapsoPhoneNumberId: KAPSO_TEST_PHONE_NUMBER_ID,
      kapsoApiBaseUrl: kapso.baseUrl,
      proactiveEvaluationEnabled: false,
      proactiveAiMessages: false,
      trustedProxyHops: 0,
    };
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config)
      .overrideProvider(AI_PROVIDER)
      .useValue(ai)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({ rawBody: true });
    app.useLogger(logger);
    await app.init();
    dispatcher = app.get(InboundMessageDispatcher);
    households = app.get(HouseholdsRepository);
    accounts = app.get(AccountsRepository);
  });

  beforeEach(() => {
    kapso.reset();
    logger.lines.length = 0;
    ai.interpretationRequests.length = 0;
    ai.imageRequests.length = 0;
    ai.replyRequests.length = 0;
    ai.willReply((replyRequest) => `[${replyRequest.situation}]`);
  });

  afterAll(async () => {
    await app.close();
    await kapso.stop();
    await testDatabase.destroy();
  });

  describe('text messages', () => {
    it('sends a reply written as several paragraphs as separate messages, in order', async () => {
      const { phones } = await householdWithSenders('Paragraphs');
      ai.willInterpretAs(transactionInterpretation());
      ai.willReply('Registrei a despesa.\n\nEstá na conta conjunta.');

      await deliver(kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, MESSAGE_TEXT));

      expect(repliesTo(phones[0] ?? '')).toEqual([
        'Registrei a despesa.',
        'Está na conta conjunta.',
      ]);
    });

    it('records a transaction for the resolved member and household and replies through the provider', async () => {
      const { fixture, phones } = await householdWithSenders('Text', 3);
      const messageId = nextMessageId();
      ai.willInterpretAs(transactionInterpretation());

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: phones[1] ?? '' }, MESSAGE_TEXT),
      );

      expect(posted).toEqual({ status: 200, body: { status: 'accepted' } });
      expect(await transactionsOf(fixture)).toEqual([
        expect.objectContaining({
          householdId: fixture.household.id,
          memberId: memberAt(fixture, 1).id,
          amountMinor: 2300,
          merchant: 'Lidl',
          source: 'WHATSAPP_TEXT',
          sourceMessageId: messageId,
        }),
      ]);
      expect(repliesTo(phones[1] ?? '')).toEqual(['[TRANSACTION_RECORDED]']);
      expect(await eventStatus(messageId)).toBe('PROCESSED');
    });

    it('goes through the financial assistant with the text and the sender name only', async () => {
      const { fixture, phones } = await householdWithSenders('Assistant Path');
      ai.willInterpretAs(transactionInterpretation());

      await deliver(kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, MESSAGE_TEXT));

      expect(ai.interpretationRequests).toHaveLength(1);
      expect(ai.interpretationRequests[0]).toMatchObject({
        message: MESSAGE_TEXT,
        senderName: memberAt(fixture, 0).name,
      });
      expect(JSON.stringify(ai.interpretationRequests)).not.toMatch(
        /conv_123|Contact Name|IE\.134/,
      );
    });

    it('answers a question from the household of the sender', async () => {
      const first = await householdWithSenders('Question First');
      const second = await householdWithSenders('Question Second');
      ai.willInterpretAs(transactionInterpretation());
      await deliver(
        kapsoTextEvent({ id: nextMessageId(), from: first.phones[0] ?? '' }, MESSAGE_TEXT),
      );
      ai.willInterpretAs(transactionInterpretation({ amount: '999' }));
      await deliver(
        kapsoTextEvent({ id: nextMessageId(), from: second.phones[0] ?? '' }, 'Gastei 999'),
      );
      ai.willInterpretAs(questionInterpretation());

      await deliver(
        kapsoTextEvent({ id: nextMessageId(), from: first.phones[0] ?? '' }, 'Quanto gastamos?'),
      );

      expect(ai.replyRequests.at(-1)).toMatchObject({
        situation: 'QUESTION_ANSWERED',
        facts: { result: { householdTotal: '€23.00' } },
      });
    });

    it('uses the time the message was sent to decide which day it belongs to', async () => {
      const { fixture, phones } = await householdWithSenders('Sent Time');
      const sentOnFirstOfOctober = String(Date.UTC(2026, 9, 1, 12) / 1000);
      ai.willInterpretAs(transactionInterpretation());

      await deliver(
        kapsoTextEvent(
          { id: nextMessageId(), from: phones[0] ?? '', timestamp: sentOnFirstOfOctober },
          MESSAGE_TEXT,
        ),
      );

      expect((await transactionsOf(fixture))[0]?.transactionDate).toBe('2026-10-01');
    });

    it('does not trust a sent time that lies in the future', async () => {
      const { fixture, phones } = await householdWithSenders('Future Sent Time');
      const farFuture = String(Date.UTC(2031, 0, 1) / 1000);
      ai.willInterpretAs(transactionInterpretation());

      await deliver(
        kapsoTextEvent(
          { id: nextMessageId(), from: phones[0] ?? '', timestamp: farFuture },
          MESSAGE_TEXT,
        ),
      );

      expect((await transactionsOf(fixture))[0]?.transactionDate).toBe(
        new Date().toISOString().slice(0, 10),
      );
    });
  });

  describe('image messages', () => {
    async function leftoverMedia(): Promise<string[]> {
      return readdir(join(tmpdir(), 'ai-personal-cfo-media')).catch(() => []);
    }

    it('downloads the media by reference, records the transaction and deletes the image', async () => {
      const { fixture, phones } = await householdWithSenders('Image');
      const messageId = nextMessageId();
      kapso.media.set('media_id_123', jpegImage());
      ai.willReadImageAs(imageReading({ amount: '43.27', merchant: 'Tesco' }));

      await deliver(
        kapsoImageEvent({ id: messageId, from: phones[0] ?? '' }, 'media_id_123', 'almoço'),
      );

      expect(await transactionsOf(fixture)).toEqual([
        expect.objectContaining({
          memberId: memberAt(fixture, 0).id,
          amountMinor: 4327,
          merchant: 'Tesco',
          source: 'WHATSAPP_IMAGE',
          sourceMessageId: messageId,
        }),
      ]);
      expect(repliesTo(phones[0] ?? '')).toEqual(['[TRANSACTION_RECORDED]']);
      expect(await leftoverMedia()).toEqual([]);
    });

    it('preserves the caption and sends the image bytes to the reader', async () => {
      const { phones } = await householdWithSenders('Caption');
      kapso.media.set('media_id_456', jpegImage());
      ai.willReadImageAs(imageReading());

      await deliver(
        kapsoImageEvent(
          { id: nextMessageId(), from: phones[0] ?? '' },
          'media_id_456',
          'almoço de equipa',
        ),
      );

      expect(ai.imageRequests).toHaveLength(1);
      expect(ai.imageRequests[0]?.caption).toBe('almoço de equipa');
      expect(ai.imageRequests[0]?.image.bytes.equals(jpegImage())).toBe(true);
      expect(ai.interpretationRequests).toEqual([]);
    });

    it('fetches only from the provider API by media identifier, never the addresses in the payload', async () => {
      const { phones } = await householdWithSenders('Media Fetch');
      kapso.media.set('media_id_789', jpegImage());
      ai.willReadImageAs(imageReading());

      await deliver(
        kapsoImageEvent({ id: nextMessageId(), from: phones[0] ?? '' }, 'media_id_789'),
      );

      expect(
        kapso.requests.filter((sent) => sent.method === 'GET').map((sent) => sent.path),
      ).toEqual([
        `/meta/whatsapp/v24.0/media_id_789?phone_number_id=${KAPSO_TEST_PHONE_NUMBER_ID}`,
        '/meta/whatsapp/media_download?token=media_id_789',
      ]);
    });

    it('stores no image, media identifier or provider address', async () => {
      const { phones } = await householdWithSenders('No Image Stored');
      kapso.media.set('media_id_secret', jpegImage());
      ai.willReadImageAs(imageReading());

      await deliver(
        kapsoImageEvent({ id: nextMessageId(), from: phones[0] ?? '' }, 'media_id_secret'),
      );
      const stored = JSON.stringify([
        await testDatabase.database.select().from(aiMessages),
        await testDatabase.database.select().from(transactions),
        await testDatabase.database.select().from(webhookEvents),
      ]);

      expect(stored).not.toContain('media_id_secret');
      expect(stored).not.toContain('api.kapso.ai');
      expect(stored).not.toContain(jpegImage().toString('base64'));
    });

    it('replies safely and records nothing when the media cannot be downloaded', async () => {
      const { fixture, phones } = await householdWithSenders('Media Missing');
      const messageId = nextMessageId();
      ai.willReadImageAs(imageReading());

      await deliver(kapsoImageEvent({ id: messageId, from: phones[0] ?? '' }, 'media_missing'));

      expect(await transactionsOf(fixture)).toEqual([]);
      expect(ai.imageRequests).toEqual([]);
      expect(repliesTo(phones[0] ?? '')).toEqual(['[IMAGE_NOT_USABLE]']);
      expect(await eventStatus(messageId)).toBe('PROCESSED');
      expect(await leftoverMedia()).toEqual([]);
    });
  });

  describe('unknown senders', () => {
    it('acknowledges the event and does nothing else', async () => {
      const messageId = nextMessageId();
      const transactionsBefore = await testDatabase.database.$count(transactions);
      const membersResolved = ai.interpretationRequests.length;

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: '15550009999' }, MESSAGE_TEXT),
      );

      expect(posted.status).toBe(200);
      expect(ai.interpretationRequests).toHaveLength(membersResolved);
      expect(ai.replyRequests).toEqual([]);
      expect(kapso.requests).toEqual([]);
      expect(await testDatabase.database.$count(transactions)).toBe(transactionsBefore);
      expect(await eventStatus(messageId)).toBe('IGNORED');
    });

    it('does not download an image from an unknown sender', async () => {
      kapso.media.set('media_unknown', jpegImage());

      await deliver(kapsoImageEvent({ id: nextMessageId(), from: '15550009998' }, 'media_unknown'));

      expect(kapso.requests).toEqual([]);
      expect(ai.imageRequests).toEqual([]);
    });

    it('does not resolve an identity registered with another provider', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Other Provider', 1);
      await households.registerWhatsAppIdentity(fixture.household.id, {
        memberId: memberAt(fixture, 0).id,
        provider: 'another-provider',
        externalUserId: '15550007777',
        phoneNumber: '+15550007777',
      });

      await deliver(kapsoTextEvent({ id: nextMessageId(), from: '15550007777' }, MESSAGE_TEXT));

      expect(ai.interpretationRequests).toEqual([]);
      expect(kapso.requests).toEqual([]);
    });
  });

  describe('authentication', () => {
    it.each([
      ['a wrong signature', { 'X-Webhook-Signature': signKapsoBody('other body') }],
      [
        'a signature made with another secret',
        { 'X-Webhook-Signature': signKapsoBody(MESSAGE_TEXT, 'guess') },
      ],
      ['a malformed signature', { 'X-Webhook-Signature': 'not-a-signature' }],
    ])('rejects a request with %s and does nothing', async (_description, headers) => {
      const { fixture, phones } = await householdWithSenders(`Auth ${_description}`);
      const messageId = nextMessageId();

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT),
        headers,
      );

      expect(posted).toEqual({ status: 401, body: { message: 'Unauthorized', statusCode: 401 } });
      expect(await eventStatus(messageId)).toBeUndefined();
      expect(await transactionsOf(fixture)).toEqual([]);
      expect(ai.interpretationRequests).toEqual([]);
      expect(kapso.requests).toEqual([]);
    });

    it('rejects a request without a signature', async () => {
      const body = JSON.stringify(
        kapsoTextEvent({ id: nextMessageId(), from: '353850000001' }, MESSAGE_TEXT),
      );

      const response = await request(app.getHttpServer())
        .post('/webhooks/whatsapp')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Event', 'whatsapp.message.received')
        .send(body);

      expect(response.status).toBe(401);
    });

    it('rejects a body that was changed after it was signed', async () => {
      const { phones } = await householdWithSenders('Tampered');
      const signedBody = JSON.stringify(
        kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, 'Gastei 1'),
      );
      const sentBody = signedBody.replace('Gastei 1', 'Gastei 9999');

      const posted = await deliver(sentBody, { 'X-Webhook-Signature': signKapsoBody(signedBody) });

      expect(posted.status).toBe(401);
      expect(ai.interpretationRequests).toEqual([]);
    });
  });

  describe('payloads', () => {
    it.each([
      ['text that is not JSON', 'definitely not json'],
      ['an object without a message', { conversation: { phone_number: '353850000001' } }],
      [
        'a text message without text',
        { message: { id: 'wamid.malformed', type: 'text', from: '353850000001' } },
      ],
    ])('rejects authenticated %s without processing anything', async (_description, payload) => {
      const posted = await deliver(payload);

      expect(posted.status).toBe(400);
      expect(ai.interpretationRequests).toEqual([]);
      expect(kapso.requests).toEqual([]);
    });

    it.each(['audio', 'video', 'document', 'sticker', 'location'])(
      'acknowledges a %s message from a known sender without processing or replying',
      async (type) => {
        const { fixture, phones } = await householdWithSenders(`Unsupported ${type}`);
        const messageId = nextMessageId();

        const posted = await deliver(
          kapsoEventOfType({ id: messageId, from: phones[0] ?? '' }, type),
        );

        expect(posted.status).toBe(200);
        expect(await eventStatus(messageId)).toBe('IGNORED');
        expect(await transactionsOf(fixture)).toEqual([]);
        expect(ai.interpretationRequests).toEqual([]);
        expect(kapso.requests).toEqual([]);
      },
    );

    it.each(['whatsapp.message.sent', 'whatsapp.message.delivered', 'whatsapp.message.read'])(
      'acknowledges the %s event without recording it',
      async (event) => {
        const { phones } = await householdWithSenders(`Event ${event}`);
        const messageId = nextMessageId();

        const posted = await deliver(
          kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT),
          {
            'X-Webhook-Event': event,
          },
        );

        expect(posted.status).toBe(200);
        expect(await eventStatus(messageId)).toBeUndefined();
        expect(ai.interpretationRequests).toEqual([]);
      },
    );

    it('processes every message of a batched delivery once, in order', async () => {
      const { fixture, phones } = await householdWithSenders('Batch');
      const sender = phones[0] ?? '';
      ai.willInterpretAs(
        transactionInterpretation({ amount: '10' }),
        transactionInterpretation({ amount: '20' }),
      );
      const batch = {
        type: 'whatsapp.message.received',
        batch: true,
        data: [
          kapsoTextEvent({ id: 'wamid.batch-1', from: sender }, 'Gastei 10'),
          kapsoTextEvent({ id: 'wamid.batch-2', from: sender }, 'Gastei 20'),
        ],
        batch_info: { size: 2 },
      };

      await deliver(batch);
      await deliver(batch);

      expect(
        (await transactionsOf(fixture)).map((row) => [row.sourceMessageId, row.amountMinor]),
      ).toEqual([
        ['wamid.batch-1', 1000],
        ['wamid.batch-2', 2000],
      ]);
      expect(repliesTo(sender)).toHaveLength(2);
    });
  });

  describe('idempotency', () => {
    it('processes a redelivered event once', async () => {
      const { fixture, phones } = await householdWithSenders('Redelivery');
      const event = kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, MESSAGE_TEXT);
      ai.willInterpretAs(transactionInterpretation(), transactionInterpretation());

      const first = await deliver(event, { 'X-Idempotency-Key': 'same-delivery' });
      const second = await deliver(event, { 'X-Idempotency-Key': 'same-delivery' });

      expect([first.status, second.status]).toEqual([200, 200]);
      expect(await transactionsOf(fixture)).toHaveLength(1);
      expect(ai.interpretationRequests).toHaveLength(1);
      expect(ai.replyRequests).toHaveLength(1);
      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
    });

    it('processes a message once even when it arrives again under a new delivery key', async () => {
      const { fixture, phones } = await householdWithSenders('New Delivery Key');
      const event = kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, MESSAGE_TEXT);
      ai.willInterpretAs(transactionInterpretation(), transactionInterpretation());

      await deliver(event, { 'X-Idempotency-Key': 'first-key' });
      await deliver(event, { 'X-Idempotency-Key': 'second-key' });

      expect(await transactionsOf(fixture)).toHaveLength(1);
      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
    });

    it('processes concurrent deliveries of the same event once', async () => {
      const { fixture, phones } = await householdWithSenders('Concurrent');
      const messageId = nextMessageId();
      const event = kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT);
      ai.willInterpretAs(...Array.from({ length: 8 }, () => transactionInterpretation()));

      const responses = await Promise.all(Array.from({ length: 8 }, () => post(event)));
      await dispatcher.whenIdle();

      expect(responses.map((response) => response.status)).toEqual(
        Array.from({ length: 8 }, () => 200),
      );
      expect(await transactionsOf(fixture)).toHaveLength(1);
      expect(ai.interpretationRequests).toHaveLength(1);
      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
      expect(
        await testDatabase.database.$count(
          webhookEvents,
          eq(webhookEvents.externalEventId, `whatsapp.message.received:${messageId}`),
        ),
      ).toBe(1);
    });

    it('does not read a redelivered image twice', async () => {
      const { fixture, phones } = await householdWithSenders('Image Redelivery');
      kapso.media.set('media_dup', jpegImage());
      const event = kapsoImageEvent({ id: nextMessageId(), from: phones[0] ?? '' }, 'media_dup');
      ai.willReadImageAs(imageReading(), imageReading());

      await deliver(event);
      await deliver(event);

      expect(await transactionsOf(fixture)).toHaveLength(1);
      expect(ai.imageRequests).toHaveLength(1);
      expect(kapso.requests.filter((sent) => sent.path.includes('media_download'))).toHaveLength(1);
      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
    });

    it('does not process again an event whose first attempt failed', async () => {
      const { fixture, phones } = await householdWithSenders('Failed Then Redelivered');
      const messageId = nextMessageId();
      const event = kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT);
      ai.willFailToInterpret('TIMEOUT');

      await deliver(event);
      ai.willInterpretAs(transactionInterpretation());
      await deliver(event);

      expect(await transactionsOf(fixture)).toEqual([]);
      expect(ai.interpretationRequests).toHaveLength(1);
      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
    });
  });

  describe('conversations over WhatsApp', () => {
    const followUp = questionInterpretation({
      period: { kind: 'PREVIOUS_MONTH', days: null, year: null, month: null },
      inheritFromPrevious: ['INTENT'],
    });

    it('handles two messages sent together by one sender in order, so the second can follow the first', async () => {
      const { phones } = await householdWithSenders('Same Sender');
      const sender = phones[0] ?? '';
      ai.willInterpretAs(questionInterpretation(), followUp);

      const responses = await Promise.all([
        post(kapsoTextEvent({ id: nextMessageId(), from: sender }, 'Quanto gastamos?')),
        post(kapsoTextEvent({ id: nextMessageId(), from: sender }, 'E no mês passado?')),
      ]);
      await dispatcher.whenIdle();

      expect(responses.map((response) => response.status)).toEqual([200, 200]);
      expect(ai.interpretationRequests).toHaveLength(2);
      expect(ai.interpretationRequests[1]?.conversation).toMatchObject({
        lastOutcome: 'QUESTION_ANSWERED',
        previousQuestion: { intent: 'SPENDING_TOTAL' },
      });
      expect(repliesTo(sender)).toEqual(['[QUESTION_ANSWERED]', '[QUESTION_ANSWERED]']);
    });

    it('keeps the conversations of different households apart when their messages arrive together', async () => {
      const first = await householdWithSenders('Together First');
      const second = await householdWithSenders('Together Second');
      ai.willInterpretAs(transactionInterpretation());
      await deliver(
        kapsoTextEvent({ id: nextMessageId(), from: first.phones[0] ?? '' }, MESSAGE_TEXT),
      );
      ai.interpretationRequests.length = 0;
      ai.replyRequests.length = 0;
      ai.willInterpretAs(questionInterpretation(), questionInterpretation());

      await Promise.all([
        post(
          kapsoTextEvent({ id: nextMessageId(), from: first.phones[0] ?? '' }, 'Quanto gastamos?'),
        ),
        post(
          kapsoTextEvent({ id: nextMessageId(), from: second.phones[0] ?? '' }, 'Quanto gastamos?'),
        ),
      ]);
      await dispatcher.whenIdle();
      const totals = ai.replyRequests.map(
        (reply) => (reply.facts as { result: { householdTotal: string } }).result.householdTotal,
      );

      expect(totals.sort()).toEqual(['€0.00', '€23.00']);
      expect(repliesTo(first.phones[0] ?? '')).toHaveLength(2);
      expect(repliesTo(second.phones[0] ?? '')).toHaveLength(1);
      expect(
        ai.interpretationRequests.filter((sent) => sent.conversation.recentUserMessages.length > 0),
      ).toHaveLength(1);
    });

    it('does not advance the conversation for a redelivered message', async () => {
      const { phones } = await householdWithSenders('Redelivered Follow Up');
      const sender = phones[0] ?? '';
      const event = kapsoTextEvent(
        { id: nextMessageId(), from: sender },
        'Pergunta entregue duas vezes',
      );
      ai.willInterpretAs(questionInterpretation(), questionInterpretation());

      await deliver(event);
      await deliver(event);

      expect(ai.interpretationRequests).toHaveLength(1);
      expect(repliesTo(sender)).toHaveLength(1);
      expect(
        await testDatabase.database.$count(
          aiMessages,
          eq(aiMessages.content, 'Pergunta entregue duas vezes'),
        ),
      ).toBe(1);
    });
  });

  describe('authorization', () => {
    it('ignores household, member and account identifiers placed in the payload', async () => {
      const own = await householdWithSenders('Payload Own');
      const other = await householdWithSenders('Payload Other');
      const event = kapsoTextEvent(
        { id: nextMessageId(), from: own.phones[0] ?? '' },
        MESSAGE_TEXT,
      ) as Record<string, unknown>;
      const injected = {
        ...event,
        household_id: other.fixture.household.id,
        householdId: other.fixture.household.id,
        member_id: memberAt(other.fixture, 0).id,
        account_id: other.fixture.jointAccount.id,
        message: {
          ...(event.message as object),
          household_id: other.fixture.household.id,
          member_id: memberAt(other.fixture, 0).id,
        },
        conversation: {
          ...(event.conversation as object),
          metadata: { householdId: other.fixture.household.id },
        },
      };
      ai.willInterpretAs(transactionInterpretation());

      await deliver(injected);

      expect(await transactionsOf(other.fixture)).toEqual([]);
      expect(await transactionsOf(own.fixture)).toEqual([
        expect.objectContaining({
          householdId: own.fixture.household.id,
          memberId: memberAt(own.fixture, 0).id,
          accountId: own.fixture.jointAccount.id,
        }),
      ]);
    });

    it('attributes each message to its own sender in a household of several members', async () => {
      const { fixture, phones } = await householdWithSenders('Several Senders', 4);
      ai.willInterpretAs(...fixture.members.map(() => transactionInterpretation()));

      for (const phone of phones) {
        await deliver(kapsoTextEvent({ id: nextMessageId(), from: phone }, MESSAGE_TEXT));
      }

      expect((await transactionsOf(fixture)).map((row) => row.memberId).sort()).toEqual(
        fixture.members.map((member) => member.id).sort(),
      );
      expect(phones.map((phone) => repliesTo(phone).length)).toEqual([1, 1, 1, 1]);
    });

    it('never replies to a number other than the sender', async () => {
      const { phones } = await householdWithSenders('Reply Target', 2);
      ai.willInterpretAs(transactionInterpretation());

      await deliver(kapsoTextEvent({ id: nextMessageId(), from: phones[0] ?? '' }, MESSAGE_TEXT));

      expect(repliesTo(phones[0] ?? '')).toHaveLength(1);
      expect(repliesTo(phones[1] ?? '')).toEqual([]);
    });
  });

  describe('failures', () => {
    it('tells the sender to try again when the model is unavailable, and records nothing', async () => {
      const { fixture, phones } = await householdWithSenders('AI Failure');
      const messageId = nextMessageId();
      ai.willFailToInterpret('RATE_LIMITED');

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT),
      );

      expect(posted.status).toBe(200);
      expect(await transactionsOf(fixture)).toEqual([]);
      expect(repliesTo(phones[0] ?? '')).toEqual([
        'I could not process that right now. Nothing was recorded. Please try again in a moment.',
      ]);
      expect(await eventStatus(messageId)).toBe('PROCESSED');
    });

    it('keeps the transaction when the reply cannot be delivered', async () => {
      const { fixture, phones } = await householdWithSenders('Outbound Failure');
      const messageId = nextMessageId();
      kapso.sendStatus = 503;
      ai.willInterpretAs(transactionInterpretation());

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT),
      );

      expect(posted.status).toBe(200);
      expect(await transactionsOf(fixture)).toHaveLength(1);
      expect(await eventStatus(messageId)).toBe('PROCESSED');
      expect(logger.lines.join('\n')).toContain(
        'event=reply-failed provider=kapso failure=UNAVAILABLE',
      );
    });

    it('marks the event failed and apologises when processing breaks unexpectedly', async () => {
      const { fixture, phones } = await householdWithSenders('Unexpected Failure');
      const messageId = nextMessageId();
      const original = ai.interpretMessage.bind(ai);
      ai.interpretMessage = (): Promise<unknown> =>
        Promise.reject(new Error('database connection lost while reading €23 at Lidl'));

      const posted = await deliver(
        kapsoTextEvent({ id: messageId, from: phones[0] ?? '' }, MESSAGE_TEXT),
      );
      ai.interpretMessage = original;

      expect(posted.status).toBe(200);
      expect(await transactionsOf(fixture)).toEqual([]);
      expect(await eventStatus(messageId)).toBe('FAILED');
      expect(repliesTo(phones[0] ?? '')).toEqual([PROCESSING_FAILED_REPLY]);
      expect(logger.lines.join('\n')).not.toContain('database connection lost');
    });
  });

  describe('logging', () => {
    it('writes outcomes and categories, never message content, amounts, numbers or secrets', async () => {
      const { phones } = await householdWithSenders('Logging');
      const sender = phones[0] ?? '';
      kapso.media.set('media_log', jpegImage());
      ai.willInterpretAs(transactionInterpretation({ merchant: 'Lidl', account: null }));
      ai.willReadImageAs(imageReading({ amount: '43.27', merchant: 'Tesco' }));
      ai.willReply('Registado: €23.00 no Lidl.');

      await deliver(kapsoTextEvent({ id: 'wamid.logging-text', from: sender }, MESSAGE_TEXT));
      await deliver(
        kapsoImageEvent({ id: 'wamid.logging-image', from: sender }, 'media_log', 'recibo Tesco'),
      );
      await deliver(
        kapsoTextEvent({ id: nextMessageId(), from: '15550001234' }, 'mensagem de desconhecido'),
      );
      await deliver(kapsoTextEvent({ id: nextMessageId(), from: sender }, MESSAGE_TEXT), {
        'X-Webhook-Signature': 'bad',
      });
      const logs = logger.lines.join('\n');

      expect(logs).toContain('event=completed provider=kapso outcome=PROCESSED');
      expect(logs).toContain('event=ignored reason=unknown-sender provider=kapso');
      expect(logs).toContain('event=rejected reason=authentication provider=kapso');
      for (const sensitive of [
        'Gastei',
        'Lidl',
        'Tesco',
        '23.00',
        '43.27',
        'recibo',
        'desconhecido',
        'Joint Account',
        sender,
        '15550001234',
        'wamid.logging',
        'media_log',
        KAPSO_TEST_SECRET,
        KAPSO_TEST_API_KEY,
        'sk-test-openai-secret',
      ]) {
        expect(logs).not.toContain(sensitive);
      }
    });
  });
});
