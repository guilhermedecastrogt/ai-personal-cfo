'use client';

import type { ReactNode } from 'react';

export default function DashboardError({ reset }: { readonly reset: () => void }): ReactNode {
  return (
    <div role="alert" className="rounded-xl border border-line bg-surface p-6">
      <h1 className="font-display text-2xl">These figures could not be loaded</h1>
      <p className="mt-2 text-muted">
        The service did not answer. Nothing is shown rather than showing figures that may be wrong.
      </p>
      <button type="button" onClick={reset} className="mt-4 rounded-lg bg-ink px-4 py-2 text-white">
        Try again
      </button>
    </div>
  );
}
