import type { ReactNode } from 'react';
import { SignInForm } from './sign-in-form';

export default function LoginPage(): ReactNode {
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-6">
      <p className="text-sm uppercase tracking-[0.18em] text-muted">Household ledger</p>
      <h1 className="mt-3 font-display text-4xl leading-tight">
        Sign in to see where the money went.
      </h1>
      <p className="mt-4 text-muted">
        Enter the access code issued to you. Everyone in a household sees the same figures.
      </p>
      <SignInForm />
    </main>
  );
}
