export interface MediaPolicy {
  readonly maximumBytes: number;
  readonly minimumSideInPixels: number;
  readonly maximumSideInPixels: number;
  readonly abandonedAfterInMinutes: number;
}

export const DEFAULT_MEDIA_POLICY: MediaPolicy = {
  maximumBytes: 10 * 1024 * 1024,
  minimumSideInPixels: 32,
  maximumSideInPixels: 10_000,
  abandonedAfterInMinutes: 30,
};
