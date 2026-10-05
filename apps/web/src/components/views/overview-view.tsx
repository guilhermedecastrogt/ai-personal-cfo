import Link from 'next/link';
import type { ReactNode } from 'react';
import type { OverviewView as Overview } from '@/lib/contracts';
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
  Share,
} from '../ui';
import { BudgetList } from './budget-list';

type Entry = Overview['currencies'][number];

function LedgerLine({
  entry,
  data,
}: {
  readonly entry: Entry;
  readonly data: Overview;
}): ReactNode {
  const { totals } = entry;
  const kept = totals.net.minor >= 0;
  return (
    <section aria-label="Month in one line" className="rounded-xl bg-ink p-6 text-white sm:p-8">
      <p className="text-sm uppercase tracking-[0.18em] text-white/60">
        {data.month.label}
        {data.month.isComplete ? '' : ' so far'}
      </p>
      <p className="mt-3 font-display text-2xl leading-snug sm:text-4xl">
        <span className="figure">{totals.income.text}</span> in,{' '}
        <span className="figure">{totals.expenses.text}</span> out,{' '}
        <span className="figure">{totals.net.text}</span> {kept ? 'kept' : 'short'}.
      </p>
      {totals.savingsRate === null ? (
        <p className="mt-4 text-sm text-white/70">
          No income recorded, so there is no savings rate.
        </p>
      ) : (
        <div className="mt-5">
          <div className="mb-1.5 flex justify-between text-sm text-white/70">
            <span>Share of income kept</span>
            <span className="figure text-white">{totals.savingsRate.text}</span>
          </div>
          <Meter value={totals.savingsRate} tone="kept" label="Share of income kept" />
        </div>
      )}
    </section>
  );
}

function Findings({ entry }: { readonly entry: Entry }): ReactNode {
  const strengths = entry.findings.filter((finding) => finding.kind === 'STRENGTH');
  const concerns = entry.findings.filter((finding) => finding.kind === 'CONCERN');
  if (entry.findings.length === 0) {
    return <Empty>Nothing stands out this month.</Empty>;
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="mb-2 text-sm font-medium text-kept">Going well</h3>
        {strengths.length === 0 ? (
          <p className="text-sm text-muted">Nothing to report.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {strengths.map((finding) => (
              <li key={finding.statement}>{finding.statement}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-concern">Needs attention</h3>
        {concerns.length === 0 ? (
          <p className="text-sm text-muted">Nothing to report.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {concerns.map((finding) => (
              <li key={finding.statement}>{finding.statement}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CurrencyOverview({
  entry,
  data,
}: {
  readonly entry: Entry;
  readonly data: Overview;
}): ReactNode {
  if (!entry.hasTransactions && entry.budgets.length === 0) {
    return (
      <Empty>
        No transactions are recorded for {data.month.label}. Send an expense or a receipt on
        WhatsApp, then refresh.
      </Empty>
    );
  }
  return (
    <>
      <LedgerLine entry={entry} data={data} />
      <Panel title="Compared with the previous period">
        {entry.comparison === null ? (
          <Empty>There is no earlier period to compare with yet.</Empty>
        ) : (
          <Rows>
            <Row label="Spending">
              <Change comparison={entry.comparison.expenses} risingIsGood={false} />
            </Row>
            <Row label="Income">
              <Change comparison={entry.comparison.income} risingIsGood />
            </Row>
            <Row label="Kept">
              <Change comparison={entry.comparison.net} risingIsGood />
            </Row>
          </Rows>
        )}
      </Panel>
      <Panel title="What stands out">
        <Findings entry={entry} />
        <p className="mt-5 text-sm">
          <Link href={`/review?month=${data.month.key}`} className="underline underline-offset-4">
            Read the full review for {data.month.label}
          </Link>
        </p>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Where it went">
          {entry.topCategories.length === 0 ? (
            <Empty>No spending recorded.</Empty>
          ) : (
            <Rows>
              {entry.topCategories.map((category) => (
                <Row
                  key={category.category}
                  label={category.category}
                  detail={<Share value={category.share} />}
                >
                  <Figure value={category.total} />
                </Row>
              ))}
            </Rows>
          )}
        </Panel>
        <Panel title="Budgets">
          {entry.budgets.length === 0 ? (
            <Empty>No budgets are set.</Empty>
          ) : (
            <BudgetList budgets={entry.budgets} />
          )}
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="End of month" note="Projection, not an actual figure">
          {entry.forecast === null ? (
            <Empty>This month is complete, so there is nothing to project.</Empty>
          ) : (
            <Rows>
              <Row label="Spent so far">
                <Figure value={entry.forecast.spent} />
              </Row>
              <Row
                label="Projected spending"
                detail={`${String(entry.forecast.daysRemaining)} days left`}
              >
                <Figure value={entry.forecast.projectedTotal} tone="caution" />
              </Row>
              <Row
                label="Recurring commitments"
                detail={`${String(entry.recurringCount)} detected`}
              >
                <Figure value={entry.recurringMonthlyEquivalent} />{' '}
                <span className="text-muted">a month</span>
              </Row>
            </Rows>
          )}
        </Panel>
        <Panel title="Balances" note="As they stand today">
          {entry.balances === null ? (
            <Empty>Balances are shown for the current month only.</Empty>
          ) : (
            <Rows>
              <Row label="Total">
                <Figure value={entry.balances.total} />
              </Row>
              <Row label="Joint accounts">
                <Figure value={entry.balances.joint} />
              </Row>
              {entry.balances.byMember.map((member) => (
                <Row key={member.member} label={member.member}>
                  <Figure value={member.total} />
                </Row>
              ))}
            </Rows>
          )}
        </Panel>
      </div>
      {entry.spendingByMember.length > 1 ? (
        <Panel title="By member">
          <Rows>
            {entry.spendingByMember.map((member) => (
              <Row
                key={member.member}
                label={member.member}
                detail={<Share value={member.spendingShare} />}
              >
                <Figure value={member.spent} /> <span className="text-muted">spent,</span>{' '}
                <Figure value={member.income} /> <span className="text-muted">received</span>
              </Row>
            ))}
          </Rows>
        </Panel>
      ) : null}
    </>
  );
}

export function OverviewView({ data }: { readonly data: Overview }): ReactNode {
  return (
    <>
      <PageHeading title="Overview" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) => <CurrencyOverview entry={entry} data={data} />}
      </CurrencySections>
    </>
  );
}
