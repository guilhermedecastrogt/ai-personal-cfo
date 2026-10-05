import type { ReactNode } from 'react';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { Comparison, Money, Ratio } from '@/lib/contracts';

const FULL_SCALE_IN_BASIS_POINTS = 10_000;
const BASIS_POINTS_PER_PERCENT = 100;

export type Tone = 'neutral' | 'kept' | 'caution' | 'concern';

const TONE_TEXT: Record<Tone, string> = {
  neutral: 'text-ink',
  kept: 'text-kept',
  caution: 'text-caution',
  concern: 'text-concern',
};

const TONE_FILL: Record<Tone, string> = {
  neutral: 'bg-accent',
  kept: 'bg-kept',
  caution: 'bg-caution',
  concern: 'bg-concern',
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-raised text-ink-soft ring-1 ring-line',
  kept: 'bg-kept-soft text-kept',
  caution: 'bg-caution-soft text-caution',
  concern: 'bg-concern-soft text-concern',
};

export function Figure({
  value,
  tone = 'neutral',
}: {
  readonly value: Money;
  readonly tone?: Tone;
}): ReactNode {
  return <span className={`figure ${TONE_TEXT[tone]}`}>{value.text}</span>;
}

export function Share({ value }: { readonly value: Ratio | null }): ReactNode {
  return <span className="figure text-muted">{value === null ? '—' : value.text}</span>;
}

export function Panel({
  title,
  note,
  action,
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-panel sm:p-7">
      <header className="mb-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="font-display text-xl tracking-tight sm:text-[1.375rem]">{title}</h2>
          {note === undefined ? null : <p className="mt-1 text-sm text-muted">{note}</p>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { readonly children: ReactNode }): ReactNode {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-4 text-sm text-muted">
      {children}
    </p>
  );
}

export function Badge({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 align-middle text-[0.6875rem] font-semibold tracking-wide ${TONE_BADGE[tone]}`}
    >
      {children}
    </span>
  );
}

export function Meter({
  value,
  tone = 'neutral',
  label,
  t,
  onHero = false,
}: {
  readonly value: Ratio | null;
  readonly tone?: Tone;
  readonly label: string;
  readonly t: Dictionary;
  readonly onHero?: boolean;
}): ReactNode {
  const filled = Math.min(Math.max(value?.basisPoints ?? 0, 0), FULL_SCALE_IN_BASIS_POINTS);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={filled / BASIS_POINTS_PER_PERCENT}
      aria-valuetext={value?.text ?? t.common.notAvailable}
      className={`h-1.5 w-full overflow-hidden rounded-full ${onHero ? 'bg-hero-ink/15' : 'bg-track'}`}
    >
      <div
        className={`h-full rounded-full ${TONE_FILL[tone]}`}
        style={{ width: `${String(filled / BASIS_POINTS_PER_PERCENT)}%` }}
      />
    </div>
  );
}

export function Change({
  comparison,
  risingIsGood,
  t,
}: {
  readonly comparison: Comparison;
  readonly risingIsGood: boolean;
  readonly t: Dictionary;
}): ReactNode {
  if (comparison.direction === 'UNCHANGED') {
    return (
      <span className="text-muted">
        {t.common.unchangedFrom} {comparison.previous.text}
      </span>
    );
  }
  const rose = comparison.direction === 'INCREASE';
  const tone: Tone = rose === risingIsGood ? 'kept' : 'concern';
  return (
    <span className={TONE_TEXT[tone]}>
      <span aria-hidden="true">{rose ? '▲ ' : '▼ '}</span>
      {rose ? t.common.upFrom : t.common.downFrom}{' '}
      <span className="figure">{comparison.previous.text}</span>
      {comparison.change === null ? null : (
        <span className="figure"> ({comparison.change.text})</span>
      )}
    </span>
  );
}

export function Rows({ children }: { readonly children: ReactNode }): ReactNode {
  return <ul className="divide-y divide-line">{children}</ul>;
}

export function Row({
  label,
  detail,
  children,
}: {
  readonly label: ReactNode;
  readonly detail?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <li className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
      <span className="min-w-[40%] flex-1">
        <span className="block break-words">{label}</span>
        {detail === undefined ? null : (
          <span className="mt-0.5 block text-sm text-muted">{detail}</span>
        )}
      </span>
      <span className="ml-auto text-right">{children}</span>
    </li>
  );
}

export function Stat({
  label,
  value,
  tone = 'neutral',
  detail,
}: {
  readonly label: string;
  readonly value: Money;
  readonly tone?: Tone;
  readonly detail?: ReactNode;
}): ReactNode {
  return (
    <div className="min-w-0">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-1.5 font-display text-2xl tracking-tight sm:text-3xl">
        <Figure value={value} tone={tone} />
      </p>
      {detail === undefined ? null : <p className="mt-1 text-sm">{detail}</p>}
    </div>
  );
}

export function CurrencySections<Entry extends { readonly currency: string }>({
  entries,
  t,
  children,
}: {
  readonly entries: readonly Entry[];
  readonly t: Dictionary;
  readonly children: (entry: Entry) => ReactNode;
}): ReactNode {
  const showCurrency = entries.length > 1;
  return (
    <div className="space-y-12">
      {showCurrency ? (
        <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
          {t.common.severalCurrencies}
        </p>
      ) : null}
      {entries.map((entry) => (
        <section
          key={entry.currency}
          aria-label={t.common.figuresIn(entry.currency)}
          className="space-y-6"
        >
          {showCurrency ? (
            <h2 className="eyebrow flex items-center gap-3 text-brass">
              <span>{entry.currency}</span>
              <span aria-hidden="true" className="h-px flex-1 bg-line" />
            </h2>
          ) : null}
          {children(entry)}
        </section>
      ))}
    </div>
  );
}

export function PageHeading({
  title,
  month,
  t,
  children,
}: {
  readonly title: string;
  readonly month?: { readonly label: string; readonly isComplete: boolean; readonly asOf: string };
  readonly t: Dictionary;
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-8 sm:mb-10">
      {month === undefined ? null : (
        <p className="eyebrow text-brass">
          {month.label}
          {month.isComplete ? '' : t.common.upTo(t.date(month.asOf))}
        </p>
      )}
      <h1 className="mt-2 font-display text-[2rem] leading-tight tracking-tight sm:text-[2.75rem]">
        {title}
      </h1>
      {children}
    </header>
  );
}
