import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

export const SESSION_COOKIE =
  process.env.NODE_ENV === 'production' ? '__Host-cfo_session' : 'cfo_session';

const HTTP_UNAUTHORIZED = 401;
const HTTP_NOT_FOUND = 404;
const DEFAULT_API_URL = 'http://localhost:3000';

export type QueryParameters = Readonly<Record<string, string | undefined>>;

export class ApiError extends Error {
  constructor(readonly status: number) {
    super(`The API responded with status ${String(status)}`);
    this.name = ApiError.name;
  }
}

export function apiUrl(path: string, parameters: QueryParameters = {}): string {
  const url = new URL(path, process.env.API_URL ?? DEFAULT_API_URL);
  for (const [name, value] of Object.entries(parameters)) {
    if (value !== undefined && value !== '') {
      url.searchParams.set(name, value);
    }
  }
  return url.toString();
}

export async function apiGet<View>(path: string, parameters: QueryParameters = {}): Promise<View> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    redirect('/login');
  }
  const response = await fetch(apiUrl(path, parameters), {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === HTTP_UNAUTHORIZED) {
    redirect('/login');
  }
  if (!response.ok) {
    throw new ApiError(response.status);
  }
  return (await response.json()) as View;
}

export async function apiFind<View>(path: string): Promise<View> {
  try {
    return await apiGet<View>(path);
  } catch (error) {
    if (error instanceof ApiError && error.status === HTTP_NOT_FOUND) {
      notFound();
    }
    throw error;
  }
}

export type ApiOutcome<View> =
  | { readonly ok: true; readonly data: View | undefined }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

export async function apiSend<View>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<ApiOutcome<View>> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    redirect('/login');
  }
  const response = await fetch(apiUrl(path), {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: 'no-store',
  });
  if (response.status === HTTP_UNAUTHORIZED) {
    redirect('/login');
  }
  const text = await response.text();
  const parsed: unknown = text === '' ? undefined : JSON.parse(text);
  return response.ok
    ? { ok: true, data: parsed as View | undefined }
    : { ok: false, status: response.status, body: parsed };
}

export async function apiPost(path: string): Promise<void> {
  const outcome = await apiSend('POST', path);
  if (!outcome.ok) {
    throw new ApiError(outcome.status);
  }
}
