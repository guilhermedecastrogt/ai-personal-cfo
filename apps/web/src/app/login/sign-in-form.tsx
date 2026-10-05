'use client';

import { useActionState, type ReactNode } from 'react';
import { signIn, type SignInState } from './actions';

const INITIAL: SignInState = { error: null };

export function SignInForm(): ReactNode {
  const [state, action, pending] = useActionState(signIn, INITIAL);
  return (
    <form action={action} className="mt-8 space-y-4">
      <label className="block text-sm font-medium" htmlFor="accessCode">
        Access code
      </label>
      <input
        id="accessCode"
        name="accessCode"
        type="password"
        autoComplete="current-password"
        required
        aria-describedby={state.error === null ? undefined : 'sign-in-error'}
        className="figure w-full rounded-lg border border-line bg-surface px-3 py-2.5"
      />
      {state.error === null ? null : (
        <p id="sign-in-error" role="alert" className="text-sm text-concern">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-ink px-4 py-2.5 font-medium text-white disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
