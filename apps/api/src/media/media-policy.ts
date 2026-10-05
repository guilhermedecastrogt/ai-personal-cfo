export interface MediaPolicy {
  readonly maximumBytes: number;
  readonly minimumSideInPixels: number;
  readonly maximumSideInPixels: number;
}

export const DEFAULT_MEDIA_POLICY: MediaPolicy = {
  maximumBytes: 10 * 1024 * 1024,
  minimumSideInPixels: 32,
  maximumSideInPixels: 10_000,
};
