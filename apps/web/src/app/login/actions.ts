'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, apiUrl } from '@/lib/api';

export type SignInError = 'INVALID' | 'UNAVAILABLE' | 'TOO_MANY';

export type SetUpError = 'INVALID_SETUP' | 'WEAK_PASSWORD' | 'UNAVAILABLE' | 'TOO_MANY';

export interface SignInState {
  readonly error: SignInError | null;
  readonly email?: string;
}

export interface SetUpState {
  readonly error: SetUpError | null;
  readonly email?: string;
}

interface IssuedSession {
  readonly token: string;
  readonly expiresAt: string;
}

const HTTP_UNAUTHORIZED = 401;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

async function post(path: string, body: object): Promise<Response | undefined> {
  return fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  }).catch(() => undefined);
}

async function startSession(response: Response): Promise<never> {
  const session = (await response.json()) as IssuedSession;
  const store = await cookies();
  await endSession(store.get(SESSION_COOKIE)?.value);
  store.set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  redirect('/');
}

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const email = field(form, 'email').trim();
  const password = field(form, 'password');
  if (email === '' || password === '') {
    return { error: 'INVALID', email };
  }
  const response = await post('/auth/sessions', { email, password });
  if (response?.status === HTTP_TOO_MANY_REQUESTS) {
    return { error: 'TOO_MANY', email };
  }
  if (response === undefined || (!response.ok && response.status !== HTTP_UNAUTHORIZED)) {
    return { error: 'UNAVAILABLE', email };
  }
  if (!response.ok) {
    return { error: 'INVALID', email };
  }
  return startSession(response);
}

export async function setUpAccess(_previous: SetUpState, form: FormData): Promise<SetUpState> {
  const accessCode = field(form, 'accessCode').trim();
  const email = field(form, 'email').trim();
  const password = field(form, 'password');
  if (accessCode === '' || email === '') {
    return { error: 'INVALID_SETUP', email };
  }
  const response = await post('/auth/credentials', { accessCode, email, password });
  if (response?.status === HTTP_TOO_MANY_REQUESTS) {
    return { error: 'TOO_MANY', email };
  }
  if (response?.status === HTTP_UNPROCESSABLE) {
    return { error: 'WEAK_PASSWORD', email };
  }
  if (response === undefined || (!response.ok && response.status !== HTTP_UNAUTHORIZED)) {
    return { error: 'UNAVAILABLE', email };
  }
  if (!response.ok) {
    return { error: 'INVALID_SETUP', email };
  }
  return startSession(response);
}

async function endSession(token: string | undefined): Promise<void> {
  if (token !== undefined) {
    await fetch(apiUrl('/auth/sessions/current'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  await endSession(store.get(SESSION_COOKIE)?.value);
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
