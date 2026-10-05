import { MediaError, type MediaSource } from './media-source.js';

export class UnavailableMediaSource implements MediaSource {
  download(): Promise<void> {
    return Promise.reject(new MediaError('DOWNLOAD_FAILED'));
  }
}
