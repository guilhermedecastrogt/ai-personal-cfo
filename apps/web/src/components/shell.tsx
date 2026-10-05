'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useRef, useTransition, type ReactNode } from 'react';
import type { SessionView } from '@/lib/contracts';
import { dictionaryFor, type Dictionary } from '@/lib/i18n/dictionary';
import { Icon, type IconName } from './icons';

type SectionKey = keyof Omit<
  Dictionary['nav'],
  'label' | 'more' | 'moreTitle' | 'groups' | 'compare' | 'members'
>;

type GroupKey = keyof Dictionary['nav']['groups'];

interface Section {
  readonly href: string;
  readonly key: SectionKey;
  readonly icon: IconName;
  readonly group: GroupKey;
  readonly usesMonth: boolean;
  readonly primary: boolean;
}

const SECTIONS: readonly Section[] = [
  { href: '/', key: 'overview', icon: 'overview', group: 'money', usesMonth: true, primary: true },
  {
    href: '/transactions',
    key: 'transactions',
    icon: 'transactions',
    group: 'money',
    usesMonth: true,
    primary: true,
  },
  {
    href: '/spending',
    key: 'spending',
    icon: 'spending',
    group: 'money',
    usesMonth: true,
    primary: false,
  },
  {
    href: '/income',
    key: 'income',
    icon: 'income',
    group: 'money',
    usesMonth: true,
    primary: false,
  },
  {
    href: '/budgets',
    key: 'budgets',
    icon: 'budgets',
    group: 'planning',
    usesMonth: true,
    primary: true,
  },
  {
    href: '/goals',
    key: 'goals',
    icon: 'goals',
    group: 'planning',
    usesMonth: true,
    primary: true,
  },
  {
    href: '/outlook',
    key: 'outlook',
    icon: 'outlook',
    group: 'planning',
    usesMonth: true,
    primary: false,
  },
  {
    href: '/recurring',
    key: 'recurring',
    icon: 'recurring',
    group: 'planning',
    usesMonth: false,
    primary: false,
  },
  {
    href: '/signals',
    key: 'signals',
    icon: 'signals',
    group: 'insight',
    usesMonth: true,
    primary: false,
  },
  {
    href: '/review',
    key: 'review',
    icon: 'review',
    group: 'insight',
    usesMonth: true,
    primary: false,
  },
  {
    href: '/accounts',
    key: 'accounts',
    icon: 'accounts',
    group: 'household',
    usesMonth: false,
    primary: false,
  },
];

const GROUPS: readonly GroupKey[] = ['money', 'planning', 'insight', 'household'];

function withMonth(section: Section, month: string | null): string {
  return month === null || !section.usesMonth ? section.href : `${section.href}?month=${month}`;
}

function isCurrent(section: Section, pathname: string): boolean {
  return section.href === '/' ? pathname === '/' : pathname.startsWith(section.href);
}

function MonthStepper({
  session,
  t,
}: {
  readonly session: SessionView;
  readonly t: Dictionary;
}): ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const month = useSearchParams().get('month');
  const selected = month ?? session.months[0]?.key ?? '';
  const position = session.months.findIndex((option) => option.key === selected);
  const older = session.months[position + 1];
  const newer = position > 0 ? session.months[position - 1] : undefined;
  const go = (key: string): void => {
    router.push(`${pathname}?month=${key}`);
  };
  const stepClass =
    'grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-raised disabled:opacity-30';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={t.shell.previousMonth}
        disabled={older === undefined}
        onClick={() => {
          if (older !== undefined) {
            go(older.key);
          }
        }}
        className={stepClass}
      >
        <Icon name="chevron-left" className="h-4 w-4" />
      </button>
      <label className="relative">
        <span className="sr-only">{t.shell.month}</span>
        <select
          value={selected}
          onChange={(event) => {
            go(event.target.value);
          }}
          className="h-9 appearance-none rounded-full border border-line bg-surface px-4 text-sm font-medium"
        >
          {session.months.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        aria-label={t.shell.nextMonth}
        disabled={newer === undefined}
        onClick={() => {
          if (newer !== undefined) {
            go(newer.key);
          }
        }}
        className={stepClass}
      >
        <Icon name="chevron-right" className="h-4 w-4" />
      </button>
    </div>
  );
}

function RefreshButton({ t }: { readonly t: Dictionary }): ReactNode {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  return (
    <button
      type="button"
      aria-label={refreshing ? t.shell.refreshing : t.shell.refresh}
      title={t.shell.refresh}
      onClick={() => {
        startRefresh(() => {
          router.refresh();
        });
      }}
      disabled={refreshing}
      className="grid h-9 w-9 place-items-center rounded-full text-ink-soft hover:bg-raised disabled:opacity-50"
    >
      <Icon name="refresh" className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
    </button>
  );
}

function SidebarNav({
  t,
  month,
  pathname,
}: {
  readonly t: Dictionary;
  readonly month: string | null;
  readonly pathname: string;
}): ReactNode {
  return (
    <nav aria-label={t.nav.label} className="space-y-6">
      {GROUPS.map((group) => (
        <div key={group}>
          <p className="eyebrow px-3 text-muted">{t.nav.groups[group]}</p>
          <ul className="mt-2 space-y-0.5">
            {SECTIONS.filter((section) => section.group === group).map((section) => {
              const current = isCurrent(section, pathname);
              return (
                <li key={section.href}>
                  <Link
                    href={withMonth(section, month)}
                    aria-current={current ? 'page' : undefined}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                      current
                        ? 'bg-accent font-medium text-accent-ink'
                        : 'text-ink-soft hover:bg-raised'
                    }`}
                  >
                    <Icon name={section.icon} className="h-[18px] w-[18px]" />
                    {t.nav[section.key]}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function MoreSheet({
  t,
  month,
  pathname,
  signOut,
  memberName,
}: {
  readonly t: Dictionary;
  readonly month: string | null;
  readonly pathname: string;
  readonly signOut: () => Promise<void>;
  readonly memberName: string;
}): ReactNode {
  const sheet = useRef<HTMLDialogElement>(null);
  const close = (): void => {
    sheet.current?.close();
  };
  const secondary = SECTIONS.filter((section) => !section.primary);
  const current = secondary.some((section) => isCurrent(section, pathname));
  return (
    <>
      <button
        type="button"
        onClick={() => {
          sheet.current?.showModal();
        }}
        aria-haspopup="dialog"
        className={`flex flex-1 flex-col items-center gap-1 py-2 text-[0.6875rem] font-medium ${
          current ? 'text-accent' : 'text-muted'
        }`}
      >
        <Icon name="more" className="h-[22px] w-[22px]" />
        {t.nav.more}
      </button>
      <dialog
        ref={sheet}
        aria-label={t.nav.moreTitle}
        onClick={(event) => {
          if (event.target === sheet.current) {
            close();
          }
        }}
        className="mx-auto mb-0 mt-auto w-full max-w-lg rounded-t-3xl border border-line bg-surface p-0 text-ink shadow-panel"
      >
        <div className="safe-bottom px-5 pb-4 pt-3">
          <div aria-hidden="true" className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
          <div className="mb-4 flex items-center justify-between">
            <p className="font-display text-xl">{t.nav.moreTitle}</p>
            <button
              type="button"
              onClick={close}
              aria-label={t.shell.close}
              className="grid h-9 w-9 place-items-center rounded-full hover:bg-raised"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
          <ul className="grid grid-cols-3 gap-2">
            {secondary.map((section) => (
              <li key={section.href}>
                <Link
                  href={withMonth(section, month)}
                  onClick={close}
                  aria-current={isCurrent(section, pathname) ? 'page' : undefined}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-2xl border px-2 py-3 text-center text-xs font-medium ${
                    isCurrent(section, pathname)
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line bg-raised text-ink-soft'
                  }`}
                >
                  <Icon name={section.icon} />
                  {t.nav[section.key]}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex items-center justify-between border-t border-line pt-4 text-sm">
            <span className="truncate text-muted">{memberName}</span>
            <form action={signOut}>
              <button
                type="submit"
                className="flex items-center gap-2 rounded-full px-3 py-2 text-concern hover:bg-concern-soft"
              >
                <Icon name="sign-out" className="h-4 w-4" />
                {t.shell.signOut}
              </button>
            </form>
          </div>
        </div>
      </dialog>
    </>
  );
}

function BottomNav({
  t,
  month,
  pathname,
  signOut,
  memberName,
}: {
  readonly t: Dictionary;
  readonly month: string | null;
  readonly pathname: string;
  readonly signOut: () => Promise<void>;
  readonly memberName: string;
}): ReactNode {
  return (
    <nav
      aria-label={t.nav.label}
      className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {SECTIONS.filter((section) => section.primary).map((section) => {
          const current = isCurrent(section, pathname);
          return (
            <li key={section.href} className="flex flex-1">
              <Link
                href={withMonth(section, month)}
                aria-current={current ? 'page' : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 text-[0.6875rem] font-medium ${
                  current ? 'text-accent' : 'text-muted'
                }`}
              >
                <Icon name={section.icon} className="h-[22px] w-[22px]" />
                {t.nav[section.key]}
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <MoreSheet
            t={t}
            month={month}
            pathname={pathname}
            signOut={signOut}
            memberName={memberName}
          />
        </li>
      </ul>
    </nav>
  );
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
  const t = dictionaryFor(session.locale);
  const pathname = usePathname();
  const month = useSearchParams().get('month');
  const usesMonth = SECTIONS.find((section) => isCurrent(section, pathname))?.usesMonth ?? true;
  return (
    <div className="lg:grid lg:min-h-screen lg:grid-cols-[16.5rem_1fr]">
      <aside className="hidden border-r border-line bg-surface lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="px-6 pb-6 pt-8">
          <p className="eyebrow text-brass">{t.brand}</p>
          <p className="mt-1.5 font-display text-2xl leading-tight">{session.household}</p>
        </div>
        <div className="flex-1 overflow-y-auto px-3">
          <SidebarNav t={t} month={month} pathname={pathname} />
        </div>
        <div className="flex items-center justify-between border-t border-line px-5 py-4 text-sm">
          <span className="truncate text-muted">{session.member}</span>
          <form action={signOut}>
            <button
              type="submit"
              aria-label={t.shell.signOut}
              title={t.shell.signOut}
              className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-raised hover:text-ink"
            >
              <Icon name="sign-out" className="h-4 w-4" />
            </button>
          </form>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="sticky top-0 z-20 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-2.5 sm:px-8">
            <p className="truncate font-display text-lg lg:hidden">{session.household}</p>
            <div className="ml-auto flex items-center gap-1">
              {usesMonth ? <MonthStepper session={session} t={t} /> : null}
              <RefreshButton t={t} />
            </div>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 pb-32 pt-7 sm:px-8 sm:pt-10 lg:pb-16">
          {children}
        </main>
      </div>
      <BottomNav
        t={t}
        month={month}
        pathname={pathname}
        signOut={signOut}
        memberName={session.member}
      />
    </div>
  );
}
