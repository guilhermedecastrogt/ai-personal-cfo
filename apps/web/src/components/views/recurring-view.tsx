import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  ActiveRecurringView,
  RecurringSort,
  RecurringView as Recurring,
  StoppedRecurringView,
} from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { Badge, CurrencySections, Empty, Figure, PageHeading, Panel, Row, Rows } from '../ui';

const SORTS: readonly RecurringSort[] = ['cost', 'next', 'name'];

function paidBy(payers: ActiveRecurringView['payers']): string {
  return payers.map((payer) => `${payer.member} (${String(payer.occurrences)})`).join(', ');
}

function SortLinks({
  current,
  t,
}: {
  readonly current: RecurringSort;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <nav
      aria-label={t.recurring.sortLabel}
      className="mb-4 flex flex-wrap items-center gap-2 text-sm"
    >
      <span className="text-muted">{t.recurring.sortBy}</span>
      {SORTS.map((sort) => (
        <Link
          key={sort}
          href={`/recurring?sort=${sort}`}
          aria-current={sort === current ? 'true' : undefined}
          className={`rounded-full px-3 py-1.5 ${
            sort === current
              ? 'bg-accent font-medium text-accent-ink'
              : 'border border-line text-ink-soft hover:bg-raised'
          }`}
        >
          {t.recurring.sorts[sort]}
        </Link>
      ))}
    </nav>
  );
}

function PriceChange({
  change,
  t,
}: {
  readonly change: NonNullable<ActiveRecurringView['priceChange']>;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <span className="mt-0.5 block">
      {t.recurring.was} <span className="figure">{change.previousAmount.text}</span>{' '}
      {t.recurring.until} {t.date(change.effectiveDate)}, {t.recurring.now}{' '}
      <span className="figure">{change.currentAmount.text}</span>
      {change.change === null ? null : <span className="figure"> ({change.change.text})</span>}
    </span>
  );
}

function Commitment({
  commitment,
  t,
}: {
  readonly commitment: ActiveRecurringView;
  readonly t: Dictionary;
}): ReactNode {
  const { priceChange } = commitment;
  return (
    <Row
      label={
        <>
          <span className="font-medium">{commitment.merchant}</span>{' '}
          {commitment.isNew ? <Badge tone="neutral">{t.recurring.isNew}</Badge> : null}{' '}
          {priceChange === null ? null : (
            <Badge tone={priceChange.direction === 'INCREASE' ? 'concern' : 'kept'}>
              {priceChange.direction === 'INCREASE' ? t.recurring.priceUp : t.recurring.priceDown}
            </Badge>
          )}
        </>
      }
      detail={
        <>
          <span className="block">
            {t.common.frequency[commitment.frequency]} · {commitment.category}
          </span>
          <span className="block">
            {t.recurring.last} {t.date(commitment.lastDate)} · {t.recurring.nextExpected}{' '}
            {t.date(commitment.nextExpectedDate)}
          </span>
          <span className="block">
            {t.recurring.paidBy} {paidBy(commitment.payers)}
          </span>
          {priceChange === null ? null : <PriceChange change={priceChange} t={t} />}
        </>
      }
    >
      <Figure value={commitment.typicalAmount} />
      <span className="block text-sm text-muted">
        <span className="figure">{commitment.annualEquivalent.text}</span> {t.common.aYear}
      </span>
    </Row>
  );
}

function Stopped({
  commitment,
  t,
}: {
  readonly commitment: StoppedRecurringView;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <Row
      label={<span className="font-medium">{commitment.merchant}</span>}
      detail={
        <>
          <span className="block">
            {t.common.frequency[commitment.frequency]} · {t.recurring.lastCharged}{' '}
            {t.date(commitment.lastDate)}
          </span>
          <span className="block">
            {t.recurring.wasExpected} {t.date(commitment.missedDate)} · {t.recurring.paidBy}{' '}
            {paidBy(commitment.payers)}
          </span>
        </>
      }
    >
      <Figure value={commitment.typicalAmount} />
    </Row>
  );
}

export function RecurringView({
  data,
  t,
}: {
  readonly data: Recurring;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.recurring.title} t={t}>
        <p className="mt-2 text-muted">{t.recurring.intro(t.date(data.today))}</p>
      </PageHeading>
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) =>
          entry.commitments.length === 0 && entry.stopped.length === 0 ? (
            <Empty>{t.recurring.none}</Empty>
          ) : (
            <>
              <Panel title={t.recurring.commitment} note={t.recurring.commitmentNote}>
                <p className="font-display text-2xl tracking-tight sm:text-3xl">
                  <Figure value={entry.monthlyEquivalent} />
                  <span className="text-lg text-muted">{t.recurring.perMonth}</span>
                  <Figure value={entry.annualEquivalent} />
                  <span className="text-lg text-muted">{t.recurring.perYear}</span>
                </p>
                <p className="mt-3 text-sm text-muted">
                  {entry.upcoming.merchants.length === 0 ? (
                    t.recurring.nothingExpected(entry.upcoming.withinDays)
                  ) : (
                    <>
                      {t.recurring.expectedIn(entry.upcoming.withinDays)}
                      <span className="figure">{entry.upcoming.total.text}</span> (
                      {entry.upcoming.merchants.join(', ')}).
                    </>
                  )}
                </p>
              </Panel>
              <Panel title={t.recurring.expenses} note={t.recurring.expensesNote}>
                {entry.commitments.length === 0 ? (
                  <Empty>{t.recurring.noneActive}</Empty>
                ) : (
                  <>
                    <SortLinks current={data.sort} t={t} />
                    <Rows>
                      {entry.commitments.map((commitment) => (
                        <Commitment
                          key={`${commitment.merchant}-${commitment.frequency}`}
                          commitment={commitment}
                          t={t}
                        />
                      ))}
                    </Rows>
                  </>
                )}
              </Panel>
              <Panel title={t.recurring.stopped} note={t.recurring.stoppedNote}>
                {entry.stopped.length === 0 ? (
                  <Empty>{t.recurring.nothingStopped}</Empty>
                ) : (
                  <Rows>
                    {entry.stopped.map((commitment) => (
                      <Stopped
                        key={`${commitment.merchant}-${commitment.frequency}`}
                        commitment={commitment}
                        t={t}
                      />
                    ))}
                  </Rows>
                )}
              </Panel>
            </>
          )
        }
      </CurrencySections>
    </>
  );
}
