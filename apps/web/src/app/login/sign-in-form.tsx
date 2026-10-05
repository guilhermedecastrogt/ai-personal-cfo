'use client';

import { useActionState, type ReactNode } from 'react';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import { signIn, type SignInState } from './actions';

const INITIAL: SignInState = { error: null };

export function SignInForm({ locale }: { readonly locale: Locale }): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(signIn, INITIAL);
  return (
    <form action={action} className="mt-10 space-y-4">
      <label className="eyebrow block text-muted" htmlFor="accessCode">
        {t.login.accessCode}
      </label>
      <input
        id="accessCode"
        name="accessCode"
        type="password"
        autoComplete="current-password"
        required
        aria-describedby={state.error === null ? undefined : 'sign-in-error'}
        className="h-12 w-full rounded-xl border border-line bg-surface px-4 text-base"
      />
      {state.error === null ? null : (
        <p id="sign-in-error" role="alert" className="text-sm text-concern">
          {t.login.errors[state.error]}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-accent font-medium text-accent-ink disabled:opacity-60"
      >
        {pending ? t.login.signingIn : t.login.signIn}
      </button>
    </form>
  );
}
