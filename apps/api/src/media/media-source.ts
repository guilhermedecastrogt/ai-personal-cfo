export const MEDIA_SOURCE = Symbol('MEDIA_SOURCE');

export interface MediaReference {
  readonly provider: string;
  readonly mediaId: string;
}

export interface DownloadRequest {
  readonly reference: MediaReference;
  readonly destinationPath: string;
  readonly maximumBytes: number;
}

export interface MediaSource {
  download(request: DownloadRequest): Promise<void>;
}

export type MediaProblem =
  | 'DOWNLOAD_FAILED'
  | 'STORAGE_FAILED'
  | 'EMPTY'
  | 'TOO_LARGE'
  | 'UNSUPPORTED_TYPE'
  | 'INVALID_DIMENSIONS';

export class MediaError extends Error {
  constructor(readonly problem: MediaProblem) {
    super(`Media could not be used: ${problem}`);
    this.name = MediaError.name;
  }
}
