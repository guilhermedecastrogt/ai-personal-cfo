import { randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { describeImage, type ImageDescription } from './image-inspection.js';
import type { MediaPolicy } from './media-policy.js';
import { MediaError, type MediaReference, type MediaSource } from './media-source.js';

export interface TemporaryImage extends ImageDescription {
  readonly bytes: Buffer;
}

const OWNER_ONLY = 0o700;
const DOWNLOAD_FILE_NAME = 'media';
const MILLISECONDS_PER_MINUTE = 60_000;

export class TemporaryMediaStore implements OnApplicationBootstrap {
  private readonly logger = new Logger(TemporaryMediaStore.name);

  constructor(
    private readonly source: MediaSource,
    private readonly rootDirectory: string,
    private readonly policy: MediaPolicy,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      await this.prepareRoot();
    } catch {
      this.logger.error('Temporary media directory is not usable');
      return;
    }
    const oldest = Date.now() - this.policy.abandonedAfterInMinutes * MILLISECONDS_PER_MINUTE;
    for (const name of await readdir(this.rootDirectory).catch((): string[] => [])) {
      const path = join(this.rootDirectory, name);
      const entry = await lstat(path).catch(() => undefined);
      if (entry !== undefined && entry.mtimeMs <= oldest) {
        await this.remove(path);
      }
    }
  }

  private async prepareRoot(): Promise<void> {
    await mkdir(this.rootDirectory, { recursive: true, mode: OWNER_ONLY });
    const root = await lstat(this.rootDirectory);
    const isOwned = typeof process.getuid !== 'function' || root.uid === process.getuid();
    if (!root.isDirectory() || root.isSymbolicLink() || !isOwned) {
      throw new MediaError('STORAGE_FAILED');
    }
    await chmod(this.rootDirectory, OWNER_ONLY);
  }

  async withImage<Result>(
    reference: MediaReference,
    use: (image: TemporaryImage) => Promise<Result>,
  ): Promise<Result> {
    const directory = join(this.rootDirectory, randomUUID());
    try {
      const path = await this.download(reference, directory);
      return await use(await this.load(path));
    } finally {
      await this.remove(directory);
    }
  }

  private async download(reference: MediaReference, directory: string): Promise<string> {
    const destinationPath = join(directory, DOWNLOAD_FILE_NAME);
    try {
      await this.prepareRoot();
      await mkdir(directory, { mode: OWNER_ONLY });
    } catch {
      throw new MediaError('STORAGE_FAILED');
    }
    try {
      await this.source.download({
        reference,
        destinationPath,
        maximumBytes: this.policy.maximumBytes,
      });
    } catch (error) {
      throw error instanceof MediaError ? error : new MediaError('DOWNLOAD_FAILED');
    }
    return destinationPath;
  }

  private async load(path: string): Promise<TemporaryImage> {
    const size = await this.sizeOf(path);
    if (size === 0) {
      throw new MediaError('EMPTY');
    }
    if (size > this.policy.maximumBytes) {
      throw new MediaError('TOO_LARGE');
    }
    const bytes = await readFile(path);
    const description = describeImage(bytes);
    if (description === undefined) {
      throw new MediaError('UNSUPPORTED_TYPE');
    }
    const { minimumSideInPixels, maximumSideInPixels } = this.policy;
    const sides = [description.width, description.height];
    if (sides.some((side) => side < minimumSideInPixels || side > maximumSideInPixels)) {
      throw new MediaError('INVALID_DIMENSIONS');
    }
    return { ...description, bytes };
  }

  private async sizeOf(path: string): Promise<number> {
    try {
      const file = await stat(path);
      return file.isFile() ? file.size : 0;
    } catch {
      throw new MediaError('DOWNLOAD_FAILED');
    }
  }

  private async remove(directory: string): Promise<void> {
    try {
      await rm(directory, { recursive: true, force: true });
    } catch {
      this.logger.error('Temporary media could not be removed');
    }
  }
}
