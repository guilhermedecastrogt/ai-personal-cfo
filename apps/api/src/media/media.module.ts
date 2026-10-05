import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Module } from '@nestjs/common';
import { DEFAULT_MEDIA_POLICY } from './media-policy.js';
import { MEDIA_SOURCE, type MediaSource } from './media-source.js';
import { TemporaryMediaStore } from './temporary-media-store.js';
import { UnavailableMediaSource } from './unavailable-media-source.js';

const TEMPORARY_DIRECTORY_NAME = 'ai-personal-cfo-media';

@Module({
  providers: [
    { provide: MEDIA_SOURCE, useClass: UnavailableMediaSource },
    {
      provide: TemporaryMediaStore,
      inject: [MEDIA_SOURCE],
      useFactory: (source: MediaSource): TemporaryMediaStore =>
        new TemporaryMediaStore(
          source,
          join(tmpdir(), TEMPORARY_DIRECTORY_NAME),
          DEFAULT_MEDIA_POLICY,
        ),
    },
  ],
  exports: [TemporaryMediaStore],
})
export class MediaModule {}
