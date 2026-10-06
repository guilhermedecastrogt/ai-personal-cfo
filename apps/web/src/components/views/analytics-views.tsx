import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  CompareView as Compare,
  MemberView as Member,
  MembersView as Members,
  MonthOption,
} from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { CompositionRing, PairBars } from '../charts';
import { Icon } from '../icons';
import {
  Change,
  CurrencySections,
  Empty,
  Figure,
  Meter,
  PageHeading,
  Panel,
  Row,
  Rows,
  Stat,
} from '../ui';
import { Categories } from './flow-views';

function MonthSelect({
  name,
  label,
  selected,
  months,
}: {
  readonly name: string;
  readonly label: string;
  readonly selected: string;
  readonly months: readonly MonthOption[];
}): ReactNode {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm sm:flex-none">
      <span className="eyebrow text-muted">{label}</span>
      <select
        name={name}
        defaultValue={selected}
        className="h-10 w-full rounded-xl border border-line bg-surface px-3 sm:w-52"
      >
        {months.map((month) => (
          <option key={month.key} value={month.key}>
            {month.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Swatch({
  className,
  label,
}: {
  readonly className: string;
  readonly label: string;
}): ReactNode {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden="true" className={`h-2 w-2 rounded-full ${className}`} />
      {label}
    </span>
  );
}

function Initial({
  name,
  large = false,
}: {
  readonly name: string;
  readonly large?: boolean;
}): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full bg-brass/15 font-display text-brass ${
        large ? 'h-12 w-12 text-xl' : 'h-7 w-7 text-sm'
      }`}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export function CompareView({
  data,
  t,
}: {
  readonly data: Compare;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.compare.title} t={t}>
        <p className="mt-3 max-w-xl text-muted">{t.compare.intro}</p>
      </PageHeading>
      <form
        method="get"
        action="/compare"
        className="mb-8 flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 shadow-panel sm:p-5"
      >
        <MonthSelect
          name="a"
          label={t.compare.first}
          selected={data.first.key}
          months={data.months}
        />
        <Icon name="chevron-right" className="mb-3 hidden h-4 w-4 text-muted sm:block" />
        <MonthSelect
          name="b"
          label={t.compare.second}
          selected={data.second.key}
          months={data.months}
        />
        <button
          type="submit"
          className="h-10 w-full rounded-xl bg-accent px-5 font-medium text-accent-ink sm:w-auto"
        >
          {t.compare.apply}
        </button>
      </form>
      {data.currencies.length === 0 ? (
        <Empty>{t.compare.none}</Empty>
      ) : (
        <CurrencySections entries={data.currencies} t={t}>
          {(entry) => (
            <>
              <Panel
                title={t.compare.totals}
                note={t.compare.versus(data.first.label, data.second.label)}
              >
                <div className="grid gap-6 sm:grid-cols-3">
                  <Stat
                    label={t.charts.spending}
                    value={entry.expenses.current}
                    detail={<Change comparison={entry.expenses} risingIsGood={false} t={t} />}
                  />
                  <Stat
                    label={t.charts.income}
                    value={entry.income.current}
                    tone="kept"
                    detail={<Change comparison={entry.income} risingIsGood t={t} />}
                  />
                  <Stat
                    label={t.charts.net}
                    value={entry.net.current}
                    tone={entry.net.current.minor < 0 ? 'concern' : 'neutral'}
                    detail={<Change comparison={entry.net} risingIsGood t={t} />}
                  />
                </div>
              </Panel>
              <Panel
                title={t.compare.categories}
                action={
                  <span className="flex gap-4 text-xs text-muted">
                    <Swatch className="bg-chart-6" label={data.first.label} />
                    <Swatch className="bg-accent" label={data.second.label} />
                  </span>
                }
              >
                {entry.categories.length === 0 ? (
                  <Empty>{t.compare.none}</Empty>
                ) : (
                  <ul className="space-y-5">
                    {entry.categories.map((row) => (
                      <li key={row.category}>
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-sm">
                          <span className="font-medium">{row.category}</span>
                          <span className="text-xs">
                            <Change comparison={row.comparison} risingIsGood={false} t={t} />
                          </span>
                        </div>
                        <PairBars
                          first={{ amount: row.first, bar: row.firstBar }}
                          second={{ amount: row.second, bar: row.secondBar }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            </>
          )}
        </CurrencySections>
      )}
    </>
  );
}

export function MembersView({
  data,
  month,
  t,
}: {
  readonly data: Members;
  readonly month: string | undefined;
  readonly t: Dictionary;
}): ReactNode {
  const suffix = month === undefined ? '' : `?month=${month}`;
  return (
    <>
      <PageHeading title={t.members.title} t={t}>
        <p className="mt-3 max-w-xl text-muted">{t.members.intro}</p>
      </PageHeading>
      <ul className="grid gap-4 sm:grid-cols-2">
        {data.members.map((member) => (
          <li key={member.key}>
            <Link
              href={`/members/${encodeURIComponent(member.key)}${suffix}`}
              aria-label={t.members.open(member.name)}
              className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-panel transition-colors hover:border-brass/50"
            >
              <Initial name={member.name} large />
              <span className="min-w-0 flex-1 truncate font-display text-xl">{member.name}</span>
              <Icon
                name="chevron-right"
                className="h-4 w-4 text-muted transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}

export function MemberView({
  data,
  t,
}: {
  readonly data: Member;
  readonly t: Dictionary;
}): ReactNode {
  const nothing = <Empty>{t.members.nothing(data.member.name, data.month.label)}</Empty>;
  return (
    <>
      <PageHeading title={data.member.name} month={data.month} t={t}>
        {data.members.length > 1 ? (
          <nav aria-label={t.members.title} className="mt-5 flex flex-wrap gap-2">
            {data.members.map((member) => {
              const current = member.key === data.member.key;
              return (
                <Link
                  key={member.key}
                  href={`/members/${encodeURIComponent(member.key)}?month=${data.month.key}`}
                  aria-current={current ? 'page' : undefined}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-1 pr-3.5 text-sm ${
                    current
                      ? 'border-accent bg-accent text-accent-ink'
                      : 'border-line bg-surface text-ink-soft hover:border-brass/50'
                  }`}
                >
                  <Initial name={member.name} />
                  {member.name}
                </Link>
              );
            })}
          </nav>
        ) : null}
      </PageHeading>
      {data.currencies.length === 0 ? (
        nothing
      ) : (
        <CurrencySections entries={data.currencies} t={t}>
          {(entry) =>
            entry.transactionCount === 0 ? (
              nothing
            ) : (
              <>
                <section className="grid gap-6 rounded-2xl border border-line bg-surface p-5 shadow-panel sm:grid-cols-3 sm:p-7">
                  <Stat
                    label={t.members.spending}
                    value={entry.spending}
                    detail={<Change comparison={entry.comparison} risingIsGood={false} t={t} />}
                  />
                  <Stat label={t.members.income} value={entry.income} tone="kept" />
                  <div className="min-w-0">
                    <p className="eyebrow text-muted">{t.members.shareOfHousehold}</p>
                    <p className="mt-1.5 font-display text-2xl tracking-tight sm:text-3xl">
                      <span className="figure">{entry.shareOfHousehold?.text ?? '—'}</span>
                    </p>
                    <div className="mt-2.5">
                      <Meter
                        value={entry.shareOfHousehold}
                        label={t.members.shareOfHousehold}
                        t={t}
                      />
                    </div>
                    <p className="mt-2 text-sm text-muted">
                      {t.members.ofHousehold(entry.householdSpending.text)}
                    </p>
                  </div>
                </section>
                {entry.composition.length === 0 ? null : (
                  <Panel title={t.charts.compositionTitle} note={t.charts.compositionNote}>
                    <CompositionRing
                      slices={entry.composition}
                      total={entry.spending}
                      totalLabel={t.members.spending}
                      t={t}
                    />
                  </Panel>
                )}
                <div className="grid gap-6 lg:grid-cols-2">
                  <Panel title={t.members.categories}>
                    <Categories rows={entry.byCategory} t={t} />
                  </Panel>
                  <Panel title={t.members.largest}>
                    {entry.largestExpenses.length === 0 ? (
                      <Empty>{t.flow.nothingRecorded}</Empty>
                    ) : (
                      <Rows>
                        {entry.largestExpenses.map((expense, position) => (
                          <Row
                            key={`${expense.date}-${String(position)}`}
                            label={expense.merchant ?? expense.category}
                            detail={`${t.date(expense.date)} · ${expense.category} · ${expense.account}`}
                          >
                            <Figure value={expense.amount} />
                          </Row>
                        ))}
                      </Rows>
                    )}
                  </Panel>
                </div>
              </>
            )
          }
        </CurrencySections>
      )}
    </>
  );
}
