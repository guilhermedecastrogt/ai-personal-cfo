import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { Logger } from '@nestjs/common';
import { APIConnectionTimeoutError } from 'openai';
import { AIProviderError } from '../ai-provider.js';
import { pngImage } from '../../media/testing/fake-media-source.fixture.js';
import { imageReading, transactionInterpretation } from '../testing/fake-ai-provider.fixture.js';
import { OpenAIProvider, categorizeFailure } from './openai-provider.js';

interface RecordedRequest {
  readonly path: string;
  readonly authorization: string;
  readonly body: Record<string, unknown>;
}

interface StubResponse {
  readonly status: number;
  readonly body: unknown;
}

const INTERPRETATION_REQUEST = {
  message: 'Gastei €23 no Lidl',
  history: [
    { role: 'USER' as const, content: 'Gastei 23' },
    { role: 'ASSISTANT' as const, content: 'Onde foi?' },
  ],
  senderName: 'Member A',
  memberNames: ['Member A', 'Member B', 'Member C'],
  accountNames: ['Joint Account'],
  categories: [
    { name: 'Food', kind: 'EXPENSE' as const, parent: null },
    { name: 'Groceries', kind: 'EXPENSE' as const, parent: 'Food' },
  ],
};

const REPLY_REQUEST = {
  situation: 'TRANSACTION_RECORDED' as const,
  userMessage: 'Gastei €23 no Lidl',
  senderName: 'Member A',
  facts: { amount: '€23.00', merchant: 'Lidl' },
};

function completed(text: string): StubResponse {
  return {
    status: 200,
    body: {
      id: 'resp_test',
      object: 'response',
      status: 'completed',
      output: [
        {
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text, annotations: [] }],
        },
      ],
    },
  };
}

function failed(status: number): StubResponse {
  return {
    status,
    body: { error: { message: 'provider detail that must not leak', type: 'error' } },
  };
}

async function readBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
}

describe('OpenAIProvider', () => {
  let server: Server;
  let baseUrl: string;
  let requests: RecordedRequest[];
  let responses: StubResponse[];

  function provider(overrides: { maximumRetries?: number } = {}): OpenAIProvider {
    return new OpenAIProvider({
      apiKey: 'sk-test-secret',
      model: 'configured-model',
      baseUrl,
      maximumRetries: 0,
      ...overrides,
    });
  }

  async function failureOf(action: Promise<unknown>): Promise<unknown> {
    try {
      await action;
    } catch (error) {
      return error;
    }
    return undefined;
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    server = createServer((request, response) => {
      void readBody(request).then((body) => {
        requests.push({
          path: request.url ?? '',
          authorization: request.headers.authorization ?? '',
          body,
        });
        const next = responses.shift() ?? failed(500);
        response.writeHead(next.status, { 'content-type': 'application/json' });
        response.end(JSON.stringify(next.body));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    requests = [];
    responses = [];
  });

  describe('interpretMessage', () => {
    it('calls the Responses API with the configured model and a strict JSON schema', async () => {
      responses.push(completed(JSON.stringify(transactionInterpretation())));

      await provider().interpretMessage(INTERPRETATION_REQUEST);

      expect(requests).toHaveLength(1);
      expect(requests[0]?.path).toBe('/v1/responses');
      expect(requests[0]?.authorization).toBe('Bearer sk-test-secret');
      expect(requests[0]?.body).toMatchObject({
        model: 'configured-model',
        store: false,
        text: { format: { type: 'json_schema', name: 'message_interpretation', strict: true } },
      });
    });

    it('sends the conversation and the latest message as input, and the options as instructions', async () => {
      responses.push(completed(JSON.stringify(transactionInterpretation())));

      await provider().interpretMessage(INTERPRETATION_REQUEST);
      const body = requests[0]?.body;

      expect(body?.input).toEqual([
        { role: 'user', content: 'Gastei 23' },
        { role: 'assistant', content: 'Onde foi?' },
        { role: 'user', content: 'Gastei €23 no Lidl' },
      ]);
      expect(body?.instructions).toEqual(
        expect.stringContaining('- Groceries (expense, under Food)'),
      );
      expect(body?.instructions).toEqual(expect.stringContaining('- Member C'));
      expect(body?.instructions).not.toEqual(expect.stringContaining('Gastei €23 no Lidl'));
    });

    it('returns the parsed structured output', async () => {
      responses.push(completed(JSON.stringify(transactionInterpretation())));

      expect(await provider().interpretMessage(INTERPRETATION_REQUEST)).toEqual(
        transactionInterpretation(),
      );
    });

    it('reports output that is not JSON as an invalid response', async () => {
      responses.push(completed('Sure! I recorded €23 at Lidl.'));

      expect(await failureOf(provider().interpretMessage(INTERPRETATION_REQUEST))).toMatchObject({
        category: 'INVALID_RESPONSE',
      });
    });

    it('reports an incomplete response as an invalid response', async () => {
      const incomplete = completed('{"kind":');
      responses.push({
        ...incomplete,
        body: { ...(incomplete.body as object), status: 'incomplete' },
      });

      expect(await failureOf(provider().interpretMessage(INTERPRETATION_REQUEST))).toMatchObject({
        category: 'INVALID_RESPONSE',
      });
    });
  });

  describe('extractTransactionFromImage', () => {
    const image = { mimeType: 'image/png' as const, bytes: pngImage() };
    const request = {
      image,
      caption: 'almoço de ontem',
      accountNames: ['Joint Account', 'Savings'],
      categories: INTERPRETATION_REQUEST.categories,
    };

    it('sends the image inline with a strict schema and without storing it', async () => {
      responses.push(completed(JSON.stringify(imageReading())));

      await provider().extractTransactionFromImage(request);
      const body = requests[0]?.body;

      expect(requests[0]?.path).toBe('/v1/responses');
      expect(body).toMatchObject({
        model: 'configured-model',
        store: false,
        text: {
          format: { type: 'json_schema', name: 'image_transaction_extraction', strict: true },
        },
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Caption: almoço de ontem' },
              {
                type: 'input_image',
                detail: 'high',
                image_url: `data:image/png;base64,${image.bytes.toString('base64')}`,
              },
            ],
          },
        ],
      });
    });

    it('sends the accounts and categories and nothing else about the household', async () => {
      responses.push(completed(JSON.stringify(imageReading())));

      await provider().extractTransactionFromImage({ ...request, caption: null });
      const body = requests[0]?.body;

      expect(body?.instructions).toEqual(expect.stringContaining('- Savings'));
      expect(body?.instructions).toEqual(
        expect.stringContaining('- Groceries (expense, under Food)'),
      );
      expect(body?.instructions).not.toEqual(expect.stringContaining('Member'));
      expect(JSON.stringify(body?.input)).toContain('No caption was sent with the image.');
      expect(Object.keys(body ?? {}).sort()).toEqual([
        'input',
        'instructions',
        'model',
        'store',
        'text',
      ]);
    });

    it('returns the parsed structured output', async () => {
      responses.push(
        completed(JSON.stringify(imageReading({ amount: '43.27', merchant: 'Tesco' }))),
      );

      expect(await provider().extractTransactionFromImage(request)).toEqual(
        imageReading({ amount: '43.27', merchant: 'Tesco' }),
      );
    });

    it('reports output that is not JSON as an invalid response', async () => {
      responses.push(completed('The receipt shows 43.27 at Tesco.'));

      expect(await failureOf(provider().extractTransactionFromImage(request))).toMatchObject({
        category: 'INVALID_RESPONSE',
      });
    });

    it('reports a rate limit without leaking the image', async () => {
      responses.push(failed(429));

      const error = (await failureOf(provider().extractTransactionFromImage(request))) as Error;

      expect(error).toMatchObject({ category: 'RATE_LIMITED' });
      expect(JSON.stringify(error) + error.message).not.toContain(image.bytes.toString('base64'));
    });
  });

  describe('composeReply', () => {
    it('sends the facts and returns the text', async () => {
      responses.push(completed('Registrado: €23.00 no Lidl.'));

      const reply = await provider().composeReply(REPLY_REQUEST);
      const body = requests[0]?.body;

      expect(reply).toBe('Registrado: €23.00 no Lidl.');
      expect(body).toMatchObject({ model: 'configured-model', store: false });
      expect(body?.input).toEqual(expect.stringContaining('"amount": "€23.00"'));
      expect(Object.keys(body ?? {})).not.toContain('text');
    });
  });

  describe('failures', () => {
    it.each([
      [401, 'AUTHENTICATION'],
      [403, 'AUTHENTICATION'],
      [429, 'RATE_LIMITED'],
      [500, 'UNAVAILABLE'],
      [503, 'UNAVAILABLE'],
      [400, 'REJECTED'],
    ])('maps HTTP %d to %s', async (status, category) => {
      responses.push(failed(status));

      const error = await failureOf(provider().composeReply(REPLY_REQUEST));

      expect(error).toBeInstanceOf(AIProviderError);
      expect(error).toMatchObject({ category });
    });

    it('maps a request that timed out to a timeout', () => {
      expect(categorizeFailure(new APIConnectionTimeoutError())).toBe('TIMEOUT');
    });

    it('maps a failure it does not recognise to unavailable', () => {
      expect(categorizeFailure(new Error('unexpected'))).toBe('UNAVAILABLE');
    });

    it('maps an unreachable provider to unavailable', async () => {
      const unreachable = new OpenAIProvider({
        apiKey: 'sk-test-secret',
        model: 'configured-model',
        baseUrl: 'http://127.0.0.1:1/v1',
        maximumRetries: 0,
      });

      expect(await failureOf(unreachable.composeReply(REPLY_REQUEST))).toMatchObject({
        category: 'UNAVAILABLE',
      });
    });

    it('never exposes the provider error, the key or the message in what it throws', async () => {
      responses.push(failed(500));

      const error = (await failureOf(provider().interpretMessage(INTERPRETATION_REQUEST))) as Error;
      const exposed = `${error.message} ${JSON.stringify(error)} ${String(error.cause)}`;

      expect(exposed).not.toContain('provider detail');
      expect(exposed).not.toContain('sk-test-secret');
      expect(exposed).not.toContain('Lidl');
    });

    it('retries a failing request a bounded number of times and then gives up', async () => {
      responses.push(failed(500), failed(500), failed(500), completed('too late'));

      const error = await failureOf(provider({ maximumRetries: 2 }).composeReply(REPLY_REQUEST));

      expect(error).toMatchObject({ category: 'UNAVAILABLE' });
      expect(requests).toHaveLength(3);
    }, 20_000);

    it('recovers when a retry succeeds', async () => {
      responses.push(failed(500), completed('Registrado.'));

      expect(await provider({ maximumRetries: 2 }).composeReply(REPLY_REQUEST)).toBe('Registrado.');
      expect(requests).toHaveLength(2);
    }, 20_000);

    it('does not retry an authentication failure', async () => {
      responses.push(failed(401), completed('should not be requested'));

      await failureOf(provider({ maximumRetries: 2 }).composeReply(REPLY_REQUEST));

      expect(requests).toHaveLength(1);
    });
  });
});
