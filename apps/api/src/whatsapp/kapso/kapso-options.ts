export const KAPSO_PROVIDER_NAME = 'kapso';

export interface KapsoOptions {
  readonly apiKey: string;
  readonly webhookSecret: string;
  readonly phoneNumberId: string;
  readonly apiBaseUrl: string;
  readonly requestTimeoutInMilliseconds?: number;
}

export const DEFAULT_REQUEST_TIMEOUT_IN_MILLISECONDS = 15_000;

export function endpoint(options: KapsoOptions, path: string): URL {
  return new URL(`${options.apiBaseUrl.replace(/\/+$/, '')}/${path}`);
}

export function timeoutOf(options: KapsoOptions): AbortSignal {
  return AbortSignal.timeout(
    options.requestTimeoutInMilliseconds ?? DEFAULT_REQUEST_TIMEOUT_IN_MILLISECONDS,
  );
}
