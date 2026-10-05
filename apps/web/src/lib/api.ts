import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const SESSION_COOKIE = 'cfo_session';

const HTTP_UNAUTHORIZED = 401;
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

export async function apiPost(path: string): Promise<void> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token === undefined) {
    redirect('/login');
  }
  const response = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  });
  if (response.status === HTTP_UNAUTHORIZED) {
    redirect('/login');
  }
  if (!response.ok) {
    throw new ApiError(response.status);
  }
}
