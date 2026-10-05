import type { ReactNode } from 'react';
import { currentDictionary } from '@/lib/session';

export default async function ReviewLoading(): Promise<ReactNode> {
  const t = await currentDictionary();
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <p className="text-sm text-muted">{t.review.preparing}</p>
      <div className="h-48 animate-pulse rounded-3xl bg-surface" />
    </div>
  );
}
