import type { ReactNode } from 'react';
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
  neutral: 'bg-ink-soft',
  kept: 'bg-kept',
  caution: 'bg-caution',
  concern: 'bg-concern',
};

const TONE_BADGE: Record<Tone, string> = {
  neutral: 'bg-mist text-ink',
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
  children,
}: {
  readonly title: string;
  readonly note?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 sm:p-6">
      <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl">{title}</h2>
        {note === undefined ? null : <p className="text-sm text-muted">{note}</p>}
      </header>
      {children}
    </section>
  );
}

export function Empty({ children }: { readonly children: ReactNode }): ReactNode {
  return <p className="rounded-lg bg-mist px-4 py-3 text-sm text-muted">{children}</p>;
}

export function Badge({
  tone,
  children,
}: {
  readonly tone: Tone;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_BADGE[tone]}`}>
      {children}
    </span>
  );
}

export function Meter({
  value,
  tone = 'neutral',
  label,
}: {
  readonly value: Ratio | null;
  readonly tone?: Tone;
  readonly label: string;
}): ReactNode {
  const filled = Math.min(Math.max(value?.basisPoints ?? 0, 0), FULL_SCALE_IN_BASIS_POINTS);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={filled / BASIS_POINTS_PER_PERCENT}
      aria-valuetext={value?.text ?? 'not available'}
      className="h-2 w-full overflow-hidden rounded-full bg-mist"
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
}: {
  readonly comparison: Comparison;
  readonly risingIsGood: boolean;
}): ReactNode {
  if (comparison.direction === 'UNCHANGED') {
    return <span className="text-muted">unchanged from {comparison.previous.text}</span>;
  }
  const rose = comparison.direction === 'INCREASE';
  const tone: Tone = rose === risingIsGood ? 'kept' : 'concern';
  return (
    <span className={TONE_TEXT[tone]}>
      {rose ? 'up' : 'down'} from <span className="figure">{comparison.previous.text}</span>
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
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
      <span>
        {label}
        {detail === undefined ? null : <span className="ml-2 text-sm text-muted">{detail}</span>}
      </span>
      <span className="text-right">{children}</span>
    </li>
  );
}

export function CurrencySections<Entry extends { readonly currency: string }>({
  entries,
  children,
}: {
  readonly entries: readonly Entry[];
  readonly children: (entry: Entry) => ReactNode;
}): ReactNode {
  const showCurrency = entries.length > 1;
  return (
    <div className="space-y-10">
      {showCurrency ? (
        <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
          This household holds money in more than one currency. Each currency is shown on its own
          and amounts are never added across currencies.
        </p>
      ) : null}
      {entries.map((entry) => (
        <section
          key={entry.currency}
          aria-label={`Figures in ${entry.currency}`}
          className="space-y-6"
        >
          {showCurrency ? (
            <h2 className="figure text-sm uppercase tracking-[0.18em] text-muted">
              {entry.currency}
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
  children,
}: {
  readonly title: string;
  readonly month?: { readonly label: string; readonly isComplete: boolean; readonly asOf: string };
  readonly children?: ReactNode;
}): ReactNode {
  return (
    <header className="mb-8">
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
      {month === undefined ? null : (
        <p className="mt-2 text-muted">
          {month.label}
          {month.isComplete ? '' : `, up to ${month.asOf}`}
        </p>
      )}
      {children}
    </header>
  );
}
