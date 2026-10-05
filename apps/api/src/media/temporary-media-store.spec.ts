import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { Logger } from '@nestjs/common';
import { DEFAULT_MEDIA_POLICY, type MediaPolicy } from './media-policy.js';
import { MediaError, type MediaProblem } from './media-source.js';
import { TemporaryMediaStore } from './temporary-media-store.js';
import {
  FakeMediaSource,
  jpegImage,
  pngImage,
  webpImage,
} from './testing/fake-media-source.fixture.js';

const REFERENCE = { provider: 'test', mediaId: 'media-1' };

describe('TemporaryMediaStore', () => {
  let root: string;
  let source: FakeMediaSource;

  function store(policy: Partial<MediaPolicy> = {}): TemporaryMediaStore {
    return new TemporaryMediaStore(source, root, { ...DEFAULT_MEDIA_POLICY, ...policy });
  }

  async function remaining(): Promise<string[]> {
    return readdir(root).catch(() => []);
  }

  async function problemOf(action: Promise<unknown>): Promise<MediaProblem | 'none' | 'other'> {
    try {
      await action;
    } catch (error) {
      return error instanceof MediaError ? error.problem : 'other';
    }
    return 'none';
  }

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  beforeEach(async () => {
    root = join(await mkdtemp(join(tmpdir(), 'cfo-media-test-')), 'media');
    source = new FakeMediaSource();
  });

  afterEach(async () => {
    await rm(dirname(root), { recursive: true, force: true });
  });

  it.each([
    ['PNG', pngImage(), 'image/png'],
    ['JPEG', jpegImage(), 'image/jpeg'],
    ['WebP', webpImage(), 'image/webp'],
  ])(
    'hands a downloaded %s to the caller with its detected type',
    async (_name, bytes, mimeType) => {
      source.holds('media-1', bytes);

      const seen = await store().withImage(REFERENCE, (image) => Promise.resolve(image));

      expect(seen).toMatchObject({ mimeType, width: 800, height: 1200 });
      expect(seen.bytes.equals(bytes)).toBe(true);
    },
  );

  it('passes the opaque reference and the size limit to the source', async () => {
    source.holds('media-1', pngImage());

    await store({ maximumBytes: 5000 }).withImage(REFERENCE, () => Promise.resolve());

    expect(source.requests).toHaveLength(1);
    expect(source.requests[0]).toMatchObject({ reference: REFERENCE, maximumBytes: 5000 });
    expect(source.requests[0]?.destinationPath.startsWith(root)).toBe(true);
  });

  describe('lifecycle of the temporary file', () => {
    it('exists while the caller is using the image, in a directory only the owner can read', async () => {
      source.holds('media-1', pngImage());

      const observed = await store().withImage(REFERENCE, async () => {
        const path = source.requests[0]?.destinationPath ?? '';
        const directory = await stat(dirname(path));
        return { contents: await readFile(path), mode: directory.mode & 0o777 };
      });

      expect(observed.contents.equals(pngImage())).toBe(true);
      expect(observed.mode).toBe(0o700);
    });

    it('is deleted after the caller finishes', async () => {
      source.holds('media-1', pngImage());

      await store().withImage(REFERENCE, () => Promise.resolve('done'));

      expect(await remaining()).toEqual([]);
    });

    it('is deleted when the caller fails', async () => {
      source.holds('media-1', pngImage());

      const failure = store().withImage(REFERENCE, () =>
        Promise.reject(new Error('provider timeout')),
      );

      await expect(failure).rejects.toThrow('provider timeout');
      expect(await remaining()).toEqual([]);
    });

    it('is deleted when the download fails part-way', async () => {
      source.download = async (request): Promise<void> => {
        await writeFile(request.destinationPath, pngImage().subarray(0, 10));
        throw new Error('connection reset');
      };

      expect(await problemOf(store().withImage(REFERENCE, () => Promise.resolve()))).toBe(
        'DOWNLOAD_FAILED',
      );
      expect(await remaining()).toEqual([]);
    });

    it('is deleted when validation rejects the file', async () => {
      source.holds('media-1', Buffer.from('%PDF-1.7'));

      await problemOf(store().withImage(REFERENCE, () => Promise.resolve()));

      expect(await remaining()).toEqual([]);
    });

    it('uses a separate directory for every image', async () => {
      source.holds('media-1', pngImage());

      await store().withImage(REFERENCE, () => Promise.resolve());
      await store().withImage(REFERENCE, () => Promise.resolve());

      const [first, second] = source.requests.map((request) => request.destinationPath);
      expect(first).not.toBe(second);
    });

    it('removes what a previous run abandoned when the application starts', async () => {
      await mkdir(join(root, 'abandoned'), { recursive: true });
      await writeFile(join(root, 'abandoned', 'media'), pngImage());
      const longAgo = new Date(Date.now() - 2 * 3_600_000);
      await utimes(join(root, 'abandoned'), longAgo, longAgo);

      await store().onApplicationBootstrap();

      expect(await remaining()).toEqual([]);
    });

    it('leaves alone an image another process is still working on', async () => {
      await mkdir(join(root, 'in-progress'), { recursive: true });
      await writeFile(join(root, 'in-progress', 'media'), pngImage());

      await store().onApplicationBootstrap();

      expect(await remaining()).toEqual(['in-progress']);
      expect(await readdir(join(root, 'in-progress'))).toEqual(['media']);
    });

    it('keeps the directory private to the user running the application', async () => {
      source.holds(REFERENCE.mediaId, pngImage());

      await store().withImage(REFERENCE, () => Promise.resolve());

      expect((await stat(root)).mode & 0o777).toBe(0o700);
    });

    it('refuses to store anything when the directory is a link to somewhere else', async () => {
      const elsewhere = await mkdtemp(join(tmpdir(), 'cfo-media-elsewhere-'));
      await rm(root, { recursive: true, force: true });
      await symlink(elsewhere, root);

      await expect(store().withImage(REFERENCE, () => Promise.resolve())).rejects.toMatchObject({
        problem: 'STORAGE_FAILED',
      });
      expect(await readdir(elsewhere)).toEqual([]);
      expect(source.requests).toEqual([]);
      await rm(root, { force: true });
      await rm(elsewhere, { recursive: true, force: true });
    });
  });

  describe('validation', () => {
    it('reports a failed download without exposing why', async () => {
      source.willFail(new Error('GET https://media.example/secret-token failed'));

      const failure = store().withImage(REFERENCE, () => Promise.resolve());

      await expect(failure).rejects.toMatchObject({ problem: 'DOWNLOAD_FAILED' });
      await expect(failure).rejects.not.toMatchObject({
        message: expect.stringContaining('secret-token') as unknown,
      });
    });

    it('reports a download that produced no file', async () => {
      source.download = (): Promise<void> => Promise.resolve();

      expect(await problemOf(store().withImage(REFERENCE, () => Promise.resolve()))).toBe(
        'DOWNLOAD_FAILED',
      );
    });

    it('rejects an empty file', async () => {
      source.holds('media-1', Buffer.alloc(0));

      expect(await problemOf(store().withImage(REFERENCE, () => Promise.resolve()))).toBe('EMPTY');
    });

    it('rejects a file over the size limit even if the source did not enforce it', async () => {
      source.holds('media-1', Buffer.concat([pngImage(), Buffer.alloc(2000)]));

      const problem = await problemOf(
        store({ maximumBytes: 1000 }).withImage(REFERENCE, () => Promise.resolve()),
      );

      expect(problem).toBe('TOO_LARGE');
    });

    it('accepts a file exactly at the size limit', async () => {
      const bytes = pngImage();
      source.holds('media-1', bytes);

      const problem = await problemOf(
        store({ maximumBytes: bytes.length }).withImage(REFERENCE, () => Promise.resolve()),
      );

      expect(problem).toBe('none');
    });

    it.each([
      ['a PDF', Buffer.from('%PDF-1.7\n')],
      ['a GIF', Buffer.from('GIF89a........................')],
      ['HTML', Buffer.from('<html><body>receipt</body></html>')],
    ])('rejects %s whatever it claims to be', async (_description, bytes) => {
      source.holds('media-1', bytes);

      expect(await problemOf(store().withImage(REFERENCE, () => Promise.resolve()))).toBe(
        'UNSUPPORTED_TYPE',
      );
    });

    it.each([
      ['too small', pngImage(8, 8)],
      ['too narrow', pngImage(10, 1200)],
      ['too wide', pngImage(20_000, 1200)],
      ['too tall', jpegImage(800, 40_000)],
    ])('rejects an image that is %s', async (_description, bytes) => {
      source.holds('media-1', bytes);

      expect(await problemOf(store().withImage(REFERENCE, () => Promise.resolve()))).toBe(
        'INVALID_DIMENSIONS',
      );
    });

    it('never calls the caller for a rejected file', async () => {
      source.holds('media-1', Buffer.from('%PDF-1.7'));
      let called = false;

      await problemOf(
        store().withImage(REFERENCE, () => {
          called = true;
          return Promise.resolve();
        }),
      );

      expect(called).toBe(false);
    });
  });
});
