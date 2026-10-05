import type { ReactNode } from 'react';
import { currentDictionary } from '@/lib/session';

export default async function Loading(): Promise<ReactNode> {
  const t = await currentDictionary();
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <p className="text-sm text-muted">{t.states.loading}</p>
      <div className="h-40 animate-pulse rounded-3xl bg-surface" />
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="h-56 animate-pulse rounded-2xl bg-surface" />
        <div className="h-56 animate-pulse rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
