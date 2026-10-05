import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  ActiveRecurringView,
  RecurringSort,
  RecurringView as Recurring,
  StoppedRecurringView,
} from '@/lib/contracts';
import { Badge, CurrencySections, Empty, Figure, PageHeading, Panel, Row, Rows } from '../ui';

const SORTS: readonly { readonly key: RecurringSort; readonly label: string }[] = [
  { key: 'cost', label: 'Cost' },
  { key: 'next', label: 'Next date' },
  { key: 'name', label: 'Name' },
];

function paidBy(payers: ActiveRecurringView['payers']): string {
  return payers.map((payer) => `${payer.member} (${String(payer.occurrences)})`).join(', ');
}

function SortLinks({ current }: { readonly current: RecurringSort }): ReactNode {
  return (
    <nav aria-label="Sort recurring expenses" className="mb-3 flex flex-wrap gap-2 text-sm">
      <span className="text-muted">Sort by</span>
      {SORTS.map((sort) => (
        <Link
          key={sort.key}
          href={`/recurring?sort=${sort.key}`}
          aria-current={sort.key === current ? 'true' : undefined}
          className={
            sort.key === current ? 'font-medium underline underline-offset-4' : 'text-muted'
          }
        >
          {sort.label}
        </Link>
      ))}
    </nav>
  );
}

function PriceChange({
  change,
}: {
  readonly change: NonNullable<ActiveRecurringView['priceChange']>;
}): ReactNode {
  return (
    <span className="block text-sm text-muted">
      Was <span className="figure">{change.previousAmount.text}</span> until {change.effectiveDate},
      now <span className="figure">{change.currentAmount.text}</span>
      {change.change === null ? null : <span className="figure"> ({change.change.text})</span>}
    </span>
  );
}

function Commitment({ commitment }: { readonly commitment: ActiveRecurringView }): ReactNode {
  const { priceChange } = commitment;
  return (
    <Row
      label={
        <>
          {commitment.merchant} {commitment.isNew ? <Badge tone="neutral">New</Badge> : null}{' '}
          {priceChange === null ? null : (
            <Badge tone={priceChange.direction === 'INCREASE' ? 'concern' : 'kept'}>
              {priceChange.direction === 'INCREASE' ? 'Price up' : 'Price down'}
            </Badge>
          )}
        </>
      }
      detail={
        <>
          {`${commitment.frequency.toLowerCase()} · ${commitment.category} · last ${commitment.lastDate} · next expected ${commitment.nextExpectedDate} · paid by ${paidBy(commitment.payers)}`}
          {priceChange === null ? null : <PriceChange change={priceChange} />}
        </>
      }
    >
      <Figure value={commitment.typicalAmount} />
      <span className="block text-sm text-muted">
        <span className="figure">{commitment.annualEquivalent.text}</span> a year
      </span>
    </Row>
  );
}

function Stopped({ commitment }: { readonly commitment: StoppedRecurringView }): ReactNode {
  return (
    <Row
      label={commitment.merchant}
      detail={`${commitment.frequency.toLowerCase()} · last charged ${commitment.lastDate} · was expected ${commitment.missedDate} · paid by ${paidBy(commitment.payers)}`}
    >
      <Figure value={commitment.typicalAmount} />
    </Row>
  );
}

export function RecurringView({ data }: { readonly data: Recurring }): ReactNode {
  return (
    <>
      <PageHeading title="Recurring">
        <p className="mt-2 text-muted">
          Regular charges found in your transactions, as of {data.today}
        </p>
      </PageHeading>
      <CurrencySections entries={data.currencies}>
        {(entry) =>
          entry.commitments.length === 0 && entry.stopped.length === 0 ? (
            <Empty>
              No recurring expense has been detected yet. It takes three regular charges from the
              same merchant.
            </Empty>
          ) : (
            <>
              <Panel title="Commitment" note="Active recurring expenses only">
                <p>
                  <Figure value={entry.monthlyEquivalent} /> a month,{' '}
                  <Figure value={entry.annualEquivalent} /> a year.
                </p>
                <p className="mt-2 text-sm text-muted">
                  {entry.upcoming.merchants.length === 0 ? (
                    `Nothing is expected in the next ${String(entry.upcoming.withinDays)} days.`
                  ) : (
                    <>
                      Expected in the next {entry.upcoming.withinDays} days:{' '}
                      <span className="figure">{entry.upcoming.total.text}</span> (
                      {entry.upcoming.merchants.join(', ')}).
                    </>
                  )}
                </p>
              </Panel>
              <Panel title="Recurring expenses" note="Weekly and yearly charges spread evenly">
                {entry.commitments.length === 0 ? (
                  <Empty>No recurring expense is active right now.</Empty>
                ) : (
                  <>
                    <SortLinks current={data.sort} />
                    <Rows>
                      {entry.commitments.map((commitment) => (
                        <Commitment
                          key={`${commitment.merchant}-${commitment.frequency}`}
                          commitment={commitment}
                        />
                      ))}
                    </Rows>
                  </>
                )}
              </Panel>
              <Panel title="Appear to have stopped" note="No charge since the expected date">
                {entry.stopped.length === 0 ? (
                  <Empty>Nothing appears to have stopped.</Empty>
                ) : (
                  <Rows>
                    {entry.stopped.map((commitment) => (
                      <Stopped
                        key={`${commitment.merchant}-${commitment.frequency}`}
                        commitment={commitment}
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
