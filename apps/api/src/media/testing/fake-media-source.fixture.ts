import { writeFile } from 'node:fs/promises';
import type { DownloadRequest, MediaSource } from '../media-source.js';

export function pngImage(width = 800, height = 1200): Buffer {
  const bytes = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'latin1');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

export function jpegImage(width = 800, height = 1200): Buffer {
  const applicationSegment = Buffer.from([0xff, 0xe0, 0x00, 0x04, 0x00, 0x00]);
  const frame = Buffer.alloc(11);
  frame.writeUInt16BE(0xffc0, 0);
  frame.writeUInt16BE(9, 2);
  frame.writeUInt8(8, 4);
  frame.writeUInt16BE(height, 5);
  frame.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), applicationSegment, frame, Buffer.alloc(16)]);
}

export function webpImage(width = 800, height = 1200): Buffer {
  const bytes = Buffer.alloc(40);
  bytes.write('RIFF', 0, 'latin1');
  bytes.write('WEBP', 8, 'latin1');
  bytes.write('VP8X', 12, 'latin1');
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

export class FakeMediaSource implements MediaSource {
  readonly requests: DownloadRequest[] = [];
  private contents = new Map<string, Buffer>();
  private failure: Error | undefined;

  holds(mediaId: string, bytes: Buffer): this {
    this.contents.set(mediaId, bytes);
    return this;
  }

  willFail(error: Error = new Error('connection reset')): this {
    this.failure = error;
    return this;
  }

  willSucceed(): this {
    this.failure = undefined;
    return this;
  }

  async download(request: DownloadRequest): Promise<void> {
    this.requests.push(request);
    if (this.failure !== undefined) {
      throw this.failure;
    }
    const bytes = this.contents.get(request.reference.mediaId);
    if (bytes === undefined) {
      throw new Error('media not found');
    }
    await writeFile(request.destinationPath, bytes);
  }
}
