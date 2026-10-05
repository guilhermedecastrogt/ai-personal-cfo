'use client';

import type { ReactNode } from 'react';
import { dictionaryFor, localeFromAcceptLanguage } from '@/lib/i18n/dictionary';

export default function DashboardError({ reset }: { readonly reset: () => void }): ReactNode {
  const t = dictionaryFor(
    localeFromAcceptLanguage(
      typeof document === 'undefined' ? null : document.documentElement.lang,
    ),
  );
  return (
    <div role="alert" className="rounded-2xl border border-line bg-surface p-6 shadow-panel sm:p-8">
      <h1 className="font-display text-2xl">{t.states.errorTitle}</h1>
      <p className="mt-2 text-muted">{t.states.errorBody}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-5 h-10 rounded-full bg-accent px-5 font-medium text-accent-ink"
      >
        {t.states.retry}
      </button>
    </div>
  );
}
