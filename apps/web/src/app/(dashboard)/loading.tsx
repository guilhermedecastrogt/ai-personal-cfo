import type { ReactNode } from 'react';

export default function Loading(): ReactNode {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <p className="text-muted">Loading the latest figures…</p>
      <div className="h-28 animate-pulse rounded-xl bg-surface" />
      <div className="h-48 animate-pulse rounded-xl bg-surface" />
    </div>
  );
}
