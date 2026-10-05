'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition, type ReactNode } from 'react';
import type { SessionView } from '@/lib/contracts';

const SECTIONS = [
  { href: '/', label: 'Overview' },
  { href: '/spending', label: 'Spending' },
  { href: '/income', label: 'Income' },
  { href: '/budgets', label: 'Budgets' },
  { href: '/goals', label: 'Goals' },
  { href: '/outlook', label: 'Outlook' },
  { href: '/signals', label: 'Signals' },
  { href: '/review', label: 'Review' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/accounts', label: 'Accounts' },
] as const;

function withMonth(href: string, month: string | null): string {
  return month === null ? href : `${href}?month=${month}`;
}

export function Shell({
  session,
  signOut,
  children,
}: {
  readonly session: SessionView;
  readonly signOut: () => Promise<void>;
  readonly children: ReactNode;
}): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const month = useSearchParams().get('month');
  const [refreshing, startRefresh] = useTransition();
  const selected = month ?? session.months[0]?.key ?? '';
  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[15rem_1fr]">
      <aside className="bg-ink text-white lg:sticky lg:top-0 lg:h-screen">
        <div className="px-5 pb-2 pt-5 lg:pt-8">
          <p className="text-xs uppercase tracking-[0.18em] text-white/60">Household ledger</p>
          <p className="mt-1 font-display text-xl">{session.household}</p>
        </div>
        <nav
          aria-label="Sections"
          className="flex gap-1 overflow-x-auto px-3 py-3 lg:flex-col lg:overflow-visible"
        >
          {SECTIONS.map((section) => {
            const current = pathname === section.href;
            return (
              <Link
                key={section.href}
                href={withMonth(section.href, month)}
                aria-current={current ? 'page' : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm ${
                  current ? 'bg-white text-ink' : 'text-white/80 hover:bg-white/10'
                }`}
              >
                {section.label}
              </Link>
            );
          })}
        </nav>
      </aside>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-5 py-3 sm:px-8">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">Month</span>
            <select
              value={selected}
              onChange={(event) => {
                router.push(withMonth(pathname, event.target.value));
              }}
              className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
            >
              {session.months.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={() => {
                startRefresh(() => {
                  router.refresh();
                });
              }}
              disabled={refreshing}
              className="rounded-lg border border-line px-3 py-1.5 disabled:opacity-60"
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
            <span className="hidden text-muted sm:inline">{session.member}</span>
            <form action={signOut}>
              <button type="submit" className="rounded-lg px-3 py-1.5 text-muted hover:text-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
        <main className="mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-10">{children}</main>
      </div>
    </div>
  );
}
