'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SESSION_COOKIE, apiUrl } from '@/lib/api';

export interface SignInState {
  readonly error: string | null;
}

interface IssuedSession {
  readonly token: string;
  readonly expiresAt: string;
}

const SIGN_IN_FAILED = 'That access code was not recognised. Check it and try again.';
const SERVICE_UNAVAILABLE = 'The service could not be reached. Try again in a moment.';
const HTTP_UNAUTHORIZED = 401;

export async function signIn(_previous: SignInState, form: FormData): Promise<SignInState> {
  const accessCode = form.get('accessCode');
  if (typeof accessCode !== 'string' || accessCode.trim() === '') {
    return { error: SIGN_IN_FAILED };
  }
  const response = await fetch(apiUrl('/auth/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accessCode: accessCode.trim() }),
    cache: 'no-store',
  }).catch(() => undefined);
  if (response === undefined || (!response.ok && response.status !== HTTP_UNAUTHORIZED)) {
    return { error: SERVICE_UNAVAILABLE };
  }
  if (!response.ok) {
    return { error: SIGN_IN_FAILED };
  }
  const session = (await response.json()) as IssuedSession;
  (await cookies()).set(SESSION_COOKIE, session.token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(session.expiresAt),
  });
  redirect('/');
}

export async function signOut(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token !== undefined) {
    await fetch(apiUrl('/auth/sessions/current'), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    }).catch(() => undefined);
  }
  store.delete(SESSION_COOKIE);
  redirect('/login');
}
