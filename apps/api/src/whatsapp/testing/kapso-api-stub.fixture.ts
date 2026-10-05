import { createHmac } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

export const KAPSO_TEST_SECRET = 'test-webhook-secret';
export const KAPSO_TEST_API_KEY = 'test-kapso-api-key';
export const KAPSO_TEST_PHONE_NUMBER_ID = '123456789012345';

export interface StubRequest {
  readonly method: string;
  readonly path: string;
  readonly apiKey: string | undefined;
  readonly body: unknown;
}

export interface KapsoEventOptions {
  readonly id: string;
  readonly from: string;
  readonly phoneNumberId?: string;
  readonly timestamp?: string;
}

export function signKapsoBody(body: string, secret = KAPSO_TEST_SECRET): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

function envelope(options: KapsoEventOptions, message: Record<string, unknown>): object {
  return {
    message: {
      id: options.id,
      timestamp: options.timestamp ?? '1792584000',
      from: options.from,
      from_user_id: 'IE.13491208655302741918',
      ...message,
    },
    conversation: {
      id: 'conv_123',
      contact_name: 'Contact Name',
      phone_number: options.from,
      status: 'active',
      metadata: {},
      phone_number_id: options.phoneNumberId ?? KAPSO_TEST_PHONE_NUMBER_ID,
    },
    is_new_conversation: false,
    phone_number_id: options.phoneNumberId ?? KAPSO_TEST_PHONE_NUMBER_ID,
  };
}

export function kapsoTextEvent(options: KapsoEventOptions, text: string): object {
  return envelope(options, {
    type: 'text',
    text: { body: text },
    kapso: { direction: 'inbound', status: 'received', has_media: false, content: text },
  });
}

export function kapsoImageEvent(
  options: KapsoEventOptions,
  mediaId: string,
  caption?: string,
): object {
  return envelope(options, {
    type: 'image',
    image: { id: mediaId, ...(caption === undefined ? {} : { caption }) },
    kapso: {
      direction: 'inbound',
      status: 'received',
      has_media: true,
      media_url: 'https://api.kapso.ai/media/should-never-be-fetched',
      media_data: { url: 'https://api.kapso.ai/media/should-never-be-fetched', byte_size: 204800 },
    },
  });
}

export function kapsoEventOfType(options: KapsoEventOptions, type: string): object {
  return envelope(options, { type, [type]: { id: 'media_x' }, kapso: { direction: 'inbound' } });
}

export class KapsoApiStub {
  readonly requests: StubRequest[] = [];
  readonly media = new Map<string, Buffer>();
  sendStatus = 200;
  downloadOrigin: string | undefined;
  redirectDownloadsTo: string | undefined;
  private server: Server | undefined;

  get origin(): string {
    const address = this.server?.address() as AddressInfo | null | undefined;
    return `http://127.0.0.1:${String(address?.port ?? 0)}`;
  }

  get baseUrl(): string {
    return `${this.origin}/meta/whatsapp/v24.0`;
  }

  get sentMessages(): StubRequest[] {
    return this.requests.filter((request) => request.path.endsWith('/messages'));
  }

  async start(): Promise<void> {
    this.server = createServer((request, response) => {
      void this.handle(request, response);
    });
    const { server } = this;
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  }

  async stop(): Promise<void> {
    this.server?.closeAllConnections();
    await new Promise((resolve) => this.server?.close(resolve));
  }

  reset(): void {
    this.requests.length = 0;
    this.media.clear();
    this.sendStatus = 200;
    this.downloadOrigin = undefined;
    this.redirectDownloadsTo = undefined;
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const url = new URL(request.url ?? '/', this.origin);
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(chunk as Buffer);
    }
    const text = Buffer.concat(chunks).toString('utf8');
    this.requests.push({
      method: request.method ?? '',
      path: `${url.pathname}${url.search}`,
      apiKey: request.headers['x-api-key'] as string | undefined,
      body: text === '' ? undefined : (JSON.parse(text) as unknown),
    });
    if (request.method === 'POST' && url.pathname.endsWith('/messages')) {
      this.json(response, this.sendStatus, {
        messaging_product: 'whatsapp',
        messages: [{ id: 'wamid.out' }],
      });
      return;
    }
    if (url.pathname.endsWith('/media_download') && this.redirectDownloadsTo !== undefined) {
      response.writeHead(302, { location: this.redirectDownloadsTo });
      response.end();
      return;
    }
    if (url.pathname.endsWith('/media_download')) {
      const bytes = this.media.get(url.searchParams.get('token') ?? '');
      response.writeHead(bytes === undefined ? 502 : 200, { 'content-type': 'image/jpeg' });
      response.end(bytes);
      return;
    }
    const mediaId = decodeURIComponent(url.pathname.split('/').at(-1) ?? '');
    const bytes = this.media.get(mediaId);
    if (bytes === undefined) {
      this.json(response, 404, { error: 'not found' });
      return;
    }
    this.json(response, 200, {
      messaging_product: 'whatsapp',
      id: mediaId,
      url: 'https://lookaside.fbsbx.com/should-never-be-fetched',
      mime_type: 'image/jpeg',
      file_size: String(bytes.length),
      download_url: `${this.downloadOrigin ?? this.origin}/meta/whatsapp/media_download?token=${encodeURIComponent(mediaId)}`,
    });
  }

  private json(response: ServerResponse, status: number, body: unknown): void {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  }
}
