'use client';

import Link from 'next/link';
import { useActionState, type ReactNode } from 'react';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import { setUpAccess, type SetUpState } from '../actions';
import { INPUT_CLASS } from '../sign-in-form';

const INITIAL: SetUpState = { error: null };
const MINIMUM_PASSWORD_LENGTH = 10;

export function SetUpForm({ locale }: { readonly locale: Locale }): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(setUpAccess, INITIAL);
  return (
    <form action={action} className="mt-10 space-y-5">
      <div className="space-y-2">
        <label className="eyebrow block text-muted" htmlFor="accessCode">
          {t.login.accessCode}
        </label>
        <input
          id="accessCode"
          name="accessCode"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={`${INPUT_CLASS} font-mono text-sm`}
        />
      </div>
      <div className="space-y-2">
        <label className="eyebrow block text-muted" htmlFor="email">
          {t.login.email}
        </label>
        <input
          id="email"
          name="email"
          key={state.email ?? ''}
          defaultValue={state.email}
          type="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          className={INPUT_CLASS}
        />
      </div>
      <div className="space-y-2">
        <label className="eyebrow block text-muted" htmlFor="password">
          {t.login.newPassword}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MINIMUM_PASSWORD_LENGTH}
          required
          aria-describedby="password-hint"
          className={INPUT_CLASS}
        />
        <p id="password-hint" className="text-sm text-muted">
          {t.login.passwordHint}
        </p>
      </div>
      {state.error === null ? null : (
        <p role="alert" className="text-sm text-concern">
          {t.login.setUpErrors[state.error]}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="h-12 w-full rounded-xl bg-accent font-medium text-accent-ink disabled:opacity-60"
      >
        {pending ? t.login.saving : t.login.saveAndEnter}
      </button>
      <p className="pt-2 text-center text-sm">
        <Link
          href="/login"
          className="text-muted underline decoration-line underline-offset-4 hover:text-ink"
        >
          {t.login.backToSignIn}
        </Link>
      </p>
    </form>
  );
}
