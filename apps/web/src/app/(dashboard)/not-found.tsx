import Link from 'next/link';
import type { ReactNode } from 'react';
import { currentDictionary } from '@/lib/session';

export default async function DashboardNotFound(): Promise<ReactNode> {
  const t = await currentDictionary();
  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
      <h1 className="font-display text-2xl">{t.states.notFoundTitle}</h1>
      <p className="mt-2 text-muted">{t.states.notFoundBody}</p>
      <Link
        href="/"
        className="mt-5 inline-flex h-10 items-center rounded-full bg-accent px-5 font-medium text-accent-ink"
      >
        {t.states.backToOverview}
      </Link>
    </div>
  );
}
