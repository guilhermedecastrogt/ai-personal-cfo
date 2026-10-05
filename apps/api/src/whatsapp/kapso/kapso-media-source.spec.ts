import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MediaError } from '../../media/media-source.js';
import { jpegImage } from '../../media/testing/fake-media-source.fixture.js';
import {
  KAPSO_TEST_API_KEY,
  KAPSO_TEST_PHONE_NUMBER_ID,
  KAPSO_TEST_SECRET,
  KapsoApiStub,
} from '../testing/kapso-api-stub.fixture.js';
import { KapsoMediaSource } from './kapso-media-source.js';

describe('KapsoMediaSource', () => {
  const stub = new KapsoApiStub();
  let directory: string;

  function source(): KapsoMediaSource {
    return new KapsoMediaSource({
      apiKey: KAPSO_TEST_API_KEY,
      webhookSecret: KAPSO_TEST_SECRET,
      phoneNumberId: KAPSO_TEST_PHONE_NUMBER_ID,
      apiBaseUrl: stub.baseUrl,
    });
  }

  function download(mediaId: string, maximumBytes = 1_000_000, provider = 'kapso'): Promise<void> {
    return source().download({
      reference: { provider, mediaId },
      destinationPath: join(directory, 'media'),
      maximumBytes,
    });
  }

  async function problemOf(action: Promise<void>): Promise<string> {
    try {
      await action;
    } catch (error) {
      return error instanceof MediaError ? error.problem : 'other';
    }
    return 'none';
  }

  beforeAll(() => stub.start());
  afterAll(() => stub.stop());

  beforeEach(async () => {
    stub.reset();
    directory = await mkdtemp(join(tmpdir(), 'cfo-kapso-media-'));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('looks the media up by identifier and writes the download to the destination', async () => {
    stub.media.set('media_id_123', jpegImage());

    await download('media_id_123');

    expect((await readFile(join(directory, 'media'))).equals(jpegImage())).toBe(true);
    expect(stub.requests.map(({ method, path, apiKey }) => ({ method, path, apiKey }))).toEqual([
      {
        method: 'GET',
        path: `/meta/whatsapp/v24.0/media_id_123?phone_number_id=${KAPSO_TEST_PHONE_NUMBER_ID}`,
        apiKey: KAPSO_TEST_API_KEY,
      },
      {
        method: 'GET',
        path: '/meta/whatsapp/media_download?token=media_id_123',
        apiKey: undefined,
      },
    ]);
  });

  it('keeps the API key out of the download request', async () => {
    stub.media.set('media_id_123', jpegImage());

    await download('media_id_123');

    expect(stub.requests[1]?.apiKey).toBeUndefined();
  });

  it('cannot be steered to another path by a crafted media identifier', async () => {
    await problemOf(download('../../platform/v1/customers'));

    expect(stub.requests[0]?.path).toBe(
      `/meta/whatsapp/v24.0/..%2F..%2Fplatform%2Fv1%2Fcustomers?phone_number_id=${KAPSO_TEST_PHONE_NUMBER_ID}`,
    );
  });

  it('refuses a download address on any other host', async () => {
    stub.media.set('media_id_123', jpegImage());
    stub.downloadOrigin = 'http://169.254.169.254';

    expect(await problemOf(download('media_id_123'))).toBe('DOWNLOAD_FAILED');
    expect(stub.requests).toHaveLength(1);
  });

  it('refuses media that is declared larger than the limit before downloading it', async () => {
    stub.media.set('media_id_123', Buffer.concat([jpegImage(), Buffer.alloc(5000)]));

    expect(await problemOf(download('media_id_123', 1000))).toBe('TOO_LARGE');
    expect(stub.requests).toHaveLength(1);
  });

  it('reports media the provider does not have', async () => {
    expect(await problemOf(download('missing'))).toBe('DOWNLOAD_FAILED');
  });

  it('refuses a reference issued by another provider', async () => {
    stub.media.set('media_id_123', jpegImage());

    expect(await problemOf(download('media_id_123', 1_000_000, 'another-provider'))).toBe(
      'DOWNLOAD_FAILED',
    );
    expect(stub.requests).toEqual([]);
  });

  it('reports an unreachable API without exposing the key or the address', async () => {
    const unreachable = new KapsoMediaSource({
      apiKey: KAPSO_TEST_API_KEY,
      webhookSecret: KAPSO_TEST_SECRET,
      phoneNumberId: KAPSO_TEST_PHONE_NUMBER_ID,
      apiBaseUrl: 'http://127.0.0.1:1/meta/whatsapp/v24.0',
    });

    const error = (await unreachable
      .download({
        reference: { provider: 'kapso', mediaId: 'media_id_123' },
        destinationPath: join(directory, 'media'),
        maximumBytes: 1000,
      })
      .catch((caught: unknown) => caught)) as Error;

    expect(error).toMatchObject({ problem: 'DOWNLOAD_FAILED' });
    expect(`${error.message}${JSON.stringify(error)}`).not.toMatch(
      /test-kapso-api-key|127\.0\.0\.1/,
    );
  });
});
