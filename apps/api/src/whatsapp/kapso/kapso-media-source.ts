import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { z } from 'zod';
import { MediaError, type DownloadRequest, type MediaSource } from '../../media/media-source.js';
import { KAPSO_PROVIDER_NAME, endpoint, timeoutOf, type KapsoOptions } from './kapso-options.js';

const mediaLocationSchema = z.object({
  download_url: z.url(),
  file_size: z.union([z.string(), z.number()]).optional(),
});

export class KapsoMediaSource implements MediaSource {
  constructor(private readonly options: KapsoOptions) {}

  async download(request: DownloadRequest): Promise<void> {
    if (request.reference.provider !== KAPSO_PROVIDER_NAME) {
      throw new MediaError('DOWNLOAD_FAILED');
    }
    const location = await this.locate(request.reference.mediaId);
    if (Number(location.file_size ?? 0) > request.maximumBytes) {
      throw new MediaError('TOO_LARGE');
    }
    const response = await this.get(this.trusted(location.download_url), {});
    if (response.body === null) {
      throw new MediaError('DOWNLOAD_FAILED');
    }
    await pipeline(
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>),
      limitTo(request.maximumBytes),
      createWriteStream(request.destinationPath),
    );
  }

  private async locate(mediaId: string): Promise<z.infer<typeof mediaLocationSchema>> {
    const url = endpoint(this.options, encodeURIComponent(mediaId));
    url.searchParams.set('phone_number_id', this.options.phoneNumberId);
    const response = await this.get(url, { 'X-API-Key': this.options.apiKey });
    const location = mediaLocationSchema.safeParse(await response.json().catch(() => undefined));
    if (!location.success) {
      throw new MediaError('DOWNLOAD_FAILED');
    }
    return location.data;
  }

  private trusted(downloadUrl: string): URL {
    const url = new URL(downloadUrl);
    if (url.origin !== new URL(this.options.apiBaseUrl).origin) {
      throw new MediaError('DOWNLOAD_FAILED');
    }
    return url;
  }

  private async get(url: URL, headers: Record<string, string>): Promise<Response> {
    const response = await fetch(url, {
      headers,
      signal: timeoutOf(this.options),
      redirect: 'error',
    }).catch(() => undefined);
    if (response?.ok !== true) {
      throw new MediaError('DOWNLOAD_FAILED');
    }
    return response;
  }
}

function limitTo(maximumBytes: number): Transform {
  let received = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback): void {
      received += chunk.length;
      if (received > maximumBytes) {
        callback(new MediaError('TOO_LARGE'));
      } else {
        callback(null, chunk);
      }
    },
  });
}
