import type { ReactNode } from 'react';
import type { CompositionSliceView, EvolutionView, Money, Ratio } from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { Figure } from './ui';

const FULL_SCALE_IN_BASIS_POINTS = 10_000;
const BASIS_POINTS_PER_PERCENT = 100;
const SLICE_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];
const OTHER_COLOR = 'var(--chart-6)';
const RING_RADIUS = 46;
const RING_WIDTH = 13;
const RING_CENTER = 59;
const RING_VIEW_BOX = '0 0 118 118';

type EvolutionMonth = EvolutionView['currencies'][number]['months'][number];

export function percentOf(ratio: Ratio): string {
  const clamped = Math.min(Math.max(ratio.basisPoints, 0), FULL_SCALE_IN_BASIS_POINTS);
  return `${String(clamped / BASIS_POINTS_PER_PERCENT)}%`;
}

function colorOf(slice: CompositionSliceView, position: number): string {
  return slice.isOther
    ? OTHER_COLOR
    : (SLICE_COLORS[position % SLICE_COLORS.length] ?? OTHER_COLOR);
}

function tipPlacement(position: number, count: number): string {
  if (position === 0) {
    return 'left-0';
  }
  return position === count - 1 ? 'right-0' : 'left-1/2 -translate-x-1/2';
}

function MonthTip({
  month,
  placement,
  t,
}: {
  readonly month: EvolutionMonth;
  readonly placement: string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <div
      aria-hidden="true"
      className={`chart-tip pointer-events-none absolute bottom-full z-10 mb-2 w-max min-w-40 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs shadow-panel ${placement}`}
    >
      <p className="mb-1.5 font-medium text-ink">{month.label}</p>
      <p className="flex justify-between gap-4">
        <span className="text-muted">{t.charts.income}</span>
        <Figure value={month.income} tone="kept" />
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-muted">{t.charts.spending}</span>
        <Figure value={month.expenses} />
      </p>
      <p className="mt-1 flex justify-between gap-4 border-t border-line pt-1">
        <span className="text-muted">{t.charts.net}</span>
        <Figure value={month.net} tone={month.net.minor < 0 ? 'concern' : 'neutral'} />
      </p>
    </div>
  );
}

export function EvolutionChart({
  months,
  t,
}: {
  readonly months: readonly EvolutionMonth[];
  readonly t: Dictionary;
}): ReactNode {
  return (
    <div>
      <div className="mb-4 flex gap-4 text-xs text-muted" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-kept" />
          {t.charts.income}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-brass" />
          {t.charts.spending}
        </span>
      </div>
      <ol
        aria-hidden="true"
        className="evolution grid auto-cols-fr grid-flow-col gap-1.5 border-b border-line sm:gap-3"
      >
        {months.map((month, position) => (
          <li key={month.key} className="relative flex flex-col items-stretch">
            <MonthTip month={month} placement={tipPlacement(position, months.length)} t={t} />
            <div className="flex h-44 items-end justify-center gap-[3px] sm:gap-1">
              <span
                className="bar w-full max-w-3.5 rounded-t-[3px] bg-kept"
                style={{ height: percentOf(month.incomeBar) }}
              />
              <span
                className="bar w-full max-w-3.5 rounded-t-[3px] bg-brass"
                style={{ height: percentOf(month.expensesBar) }}
              />
            </div>
          </li>
        ))}
      </ol>
      <ol
        aria-hidden="true"
        className="mt-2 grid auto-cols-fr grid-flow-col gap-1.5 text-center text-[0.6875rem] text-muted sm:gap-3"
      >
        {months.map((month, position) => (
          <li
            key={month.key}
            className={position === months.length - 1 ? 'font-semibold text-ink' : ''}
          >
            {month.shortLabel}
          </li>
        ))}
      </ol>
      <table className="sr-only-table">
        <caption>{t.charts.evolutionNote}</caption>
        <thead>
          <tr>
            <th scope="col">{t.charts.month}</th>
            <th scope="col">{t.charts.income}</th>
            <th scope="col">{t.charts.spending}</th>
            <th scope="col">{t.charts.net}</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.key}>
              <th scope="row">{month.label}</th>
              <td>{month.income.text}</td>
              <td>{month.expenses.text}</td>
              <td>{month.net.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CompositionRing({
  slices,
  total,
  totalLabel,
  t,
}: {
  readonly slices: readonly CompositionSliceView[];
  readonly total: Money;
  readonly totalLabel: string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <div className="composition flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
      <div className="relative shrink-0">
        <svg viewBox={RING_VIEW_BOX} aria-hidden="true" className="h-44 w-44 -rotate-90">
          <circle
            cx={RING_CENTER}
            cy={RING_CENTER}
            r={RING_RADIUS}
            fill="none"
            stroke="var(--track)"
            strokeWidth={RING_WIDTH}
          />
          {slices.map((slice, position) => (
            <circle
              key={slice.category}
              data-slice={position}
              cx={RING_CENTER}
              cy={RING_CENTER}
              r={RING_RADIUS}
              fill="none"
              stroke={colorOf(slice, position)}
              strokeWidth={RING_WIDTH}
              pathLength={FULL_SCALE_IN_BASIS_POINTS}
              strokeDasharray={`${String(slice.share.basisPoints)} ${String(FULL_SCALE_IN_BASIS_POINTS)}`}
              strokeDashoffset={`-${String(slice.offset.basisPoints)}`}
              className="slice"
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <p className="eyebrow text-muted">{totalLabel}</p>
            <p className="mt-1 font-display text-lg tracking-tight">
              <Figure value={total} />
            </p>
          </div>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-1">
        {slices.map((slice, position) => (
          <li
            key={slice.category}
            data-slice={position}
            className="slice-row flex items-baseline gap-3 rounded-lg px-2 py-1.5 text-sm"
          >
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 translate-y-px rounded-full"
              style={{ background: colorOf(slice, position) }}
            />
            <span className="min-w-0 flex-1 truncate">{slice.category}</span>
            <span className="figure text-muted">{slice.share.text}</span>
            <span className="w-24 shrink-0 text-right">
              <Figure value={slice.total} />
            </span>
          </li>
        ))}
      </ul>
      <p className="sr-only">{t.charts.compositionNote}</p>
    </div>
  );
}

export function PairBars({
  first,
  second,
}: {
  readonly first: { readonly amount: Money; readonly bar: Ratio };
  readonly second: { readonly amount: Money; readonly bar: Ratio };
}): ReactNode {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-xs">
        <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-track">
          <span
            className="block h-full rounded-full bg-chart-6"
            style={{ width: percentOf(first.bar) }}
          />
        </span>
        <span className="w-24 shrink-0 text-right text-muted">
          <Figure value={first.amount} />
        </span>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <span aria-hidden="true" className="h-2 flex-1 overflow-hidden rounded-full bg-track">
          <span
            className="block h-full rounded-full bg-accent"
            style={{ width: percentOf(second.bar) }}
          />
        </span>
        <span className="w-24 shrink-0 text-right">
          <Figure value={second.amount} />
        </span>
      </div>
    </div>
  );
}
