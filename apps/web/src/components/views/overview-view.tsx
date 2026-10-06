import Link from 'next/link';
import type { ReactNode } from 'react';
import type { EvolutionView, OverviewView as Overview } from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
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
import { EvolutionChart } from '../charts';
import { BudgetList } from './budget-list';

type Entry = Overview['currencies'][number];

function LedgerLine({
  entry,
  data,
  t,
}: {
  readonly entry: Entry;
  readonly data: Overview;
  readonly t: Dictionary;
}): ReactNode {
  const { totals } = entry;
  const kept = totals.net.minor >= 0;
  return (
    <section
      aria-label={t.overview.monthInOneLine}
      className="relative overflow-hidden rounded-3xl bg-hero p-6 text-hero-ink shadow-panel sm:p-9"
    >
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass to-transparent"
      />
      <p className="eyebrow text-brass">
        {data.month.label}
        {data.month.isComplete ? '' : t.overview.soFar}
      </p>
      <p className="mt-4 font-display text-[1.65rem] leading-snug tracking-tight sm:text-[2.6rem] sm:leading-tight">
        <span className="figure">{totals.income.text}</span> {t.overview.inWord},{' '}
        <span className="figure">{totals.expenses.text}</span> {t.overview.outWord},{' '}
        <span className={`figure ${kept ? '' : 'text-concern'}`}>{totals.net.text}</span>{' '}
        {kept ? t.overview.kept : t.overview.short}.
      </p>
      {totals.savingsRate === null ? (
        <p className="mt-5 text-sm text-hero-muted">{t.overview.noSavingsRate}</p>
      ) : (
        <div className="mt-7 max-w-md">
          <div className="mb-2 flex items-baseline justify-between text-sm text-hero-muted">
            <span>{t.overview.shareKept}</span>
            <span className="figure text-base text-hero-ink">{totals.savingsRate.text}</span>
          </div>
          <Meter value={totals.savingsRate} tone="kept" label={t.overview.shareKept} t={t} onHero />
        </div>
      )}
    </section>
  );
}

function Findings({ entry, t }: { readonly entry: Entry; readonly t: Dictionary }): ReactNode {
  const strengths = entry.findings.filter((finding) => finding.kind === 'STRENGTH');
  const concerns = entry.findings.filter((finding) => finding.kind === 'CONCERN');
  if (entry.findings.length === 0) {
    return <Empty>{t.overview.nothingStandsOut}</Empty>;
  }
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <h3 className="eyebrow mb-3 text-kept">{t.overview.goingWell}</h3>
        {strengths.length === 0 ? (
          <p className="text-sm text-muted">{t.common.nothingToReport}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {strengths.map((finding) => (
              <li key={finding.statement}>{finding.statement}</li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <h3 className="eyebrow mb-3 text-concern">{t.overview.needsAttention}</h3>
        {concerns.length === 0 ? (
          <p className="text-sm text-muted">{t.common.nothingToReport}</p>
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

function EvolutionPanel({
  evolution,
  currency,
  monthKey,
  t,
}: {
  readonly evolution: EvolutionView;
  readonly currency: string;
  readonly monthKey: string;
  readonly t: Dictionary;
}): ReactNode {
  const series = evolution.currencies.find((entry) => entry.currency === currency);
  if (series === undefined) {
    return null;
  }
  const choices = [
    { months: 6, label: t.charts.sixMonths },
    { months: 12, label: t.charts.twelveMonths },
  ];
  return (
    <Panel
      title={t.charts.evolutionTitle(evolution.months)}
      note={t.charts.evolutionNote}
      action={
        <span className="flex rounded-full border border-line p-0.5 text-xs">
          {choices.map((choice) => (
            <Link
              key={choice.months}
              href={`/?month=${monthKey}&months=${String(choice.months)}`}
              scroll={false}
              aria-current={choice.months === evolution.months ? 'true' : undefined}
              className={`rounded-full px-3 py-1 ${
                choice.months === evolution.months
                  ? 'bg-accent font-medium text-accent-ink'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {choice.label}
            </Link>
          ))}
        </span>
      }
    >
      <EvolutionChart months={series.months} t={t} />
    </Panel>
  );
}

function CurrencyOverview({
  entry,
  data,
  evolution,
  t,
}: {
  readonly entry: Entry;
  readonly data: Overview;
  readonly evolution: EvolutionView;
  readonly t: Dictionary;
}): ReactNode {
  if (!entry.hasTransactions && entry.budgets.length === 0) {
    return <Empty>{t.overview.noTransactions(data.month.label)}</Empty>;
  }
  return (
    <>
      <LedgerLine entry={entry} data={data} t={t} />
      <EvolutionPanel
        evolution={evolution}
        currency={entry.currency}
        monthKey={data.month.key}
        t={t}
      />
      <Panel title={t.overview.compared}>
        {entry.comparison === null ? (
          <Empty>{t.common.noEarlierPeriod}</Empty>
        ) : (
          <Rows>
            <Row label={t.overview.spendingLabel}>
              <Change comparison={entry.comparison.expenses} risingIsGood={false} t={t} />
            </Row>
            <Row label={t.overview.incomeLabel}>
              <Change comparison={entry.comparison.income} risingIsGood t={t} />
            </Row>
            <Row label={t.overview.keptLabel}>
              <Change comparison={entry.comparison.net} risingIsGood t={t} />
            </Row>
          </Rows>
        )}
      </Panel>
      <Panel title={t.overview.standsOut}>
        <Findings entry={entry} t={t} />
        <p className="mt-6 text-sm">
          <Link
            href={`/review?month=${data.month.key}`}
            className="font-medium text-accent underline decoration-brass underline-offset-4"
          >
            {t.overview.readReview(data.month.label)}
          </Link>
        </p>
      </Panel>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.overview.whereItWent}>
          {entry.topCategories.length === 0 ? (
            <Empty>{t.overview.noSpending}</Empty>
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
        <Panel title={t.overview.budgets}>
          {entry.budgets.length === 0 ? (
            <Empty>{t.overview.noBudgets}</Empty>
          ) : (
            <BudgetList budgets={entry.budgets} t={t} />
          )}
        </Panel>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title={t.overview.endOfMonth} note={t.overview.projectionNote}>
          {entry.forecast === null ? (
            <Empty>{t.overview.monthComplete}</Empty>
          ) : (
            <Rows>
              <Row label={t.overview.spentSoFar}>
                <Figure value={entry.forecast.spent} />
              </Row>
              <Row
                label={t.overview.projectedSpending}
                detail={t.common.daysLeft(entry.forecast.daysRemaining)}
              >
                <Figure value={entry.forecast.projectedTotal} tone="caution" />
              </Row>
              <Row
                label={t.overview.recurringCommitments}
                detail={t.overview.detected(entry.recurringCount)}
              >
                <Figure value={entry.recurringMonthlyEquivalent} />{' '}
                <span className="text-muted">{t.common.aMonth}</span>
              </Row>
            </Rows>
          )}
        </Panel>
        <Panel title={t.overview.balances} note={t.overview.balancesNote}>
          {entry.balances === null ? (
            <Empty>{t.overview.balancesCurrentOnly}</Empty>
          ) : (
            <Rows>
              <Row label={t.overview.total}>
                <Figure value={entry.balances.total} />
              </Row>
              <Row label={t.overview.jointAccounts}>
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
        <Panel title={t.overview.byMember}>
          <Rows>
            {entry.spendingByMember.map((member) => (
              <Row
                key={member.member}
                label={member.member}
                detail={<Share value={member.spendingShare} />}
              >
                <span className="block">
                  <Figure value={member.spent} />{' '}
                  <span className="text-muted">{t.overview.spent}</span>
                </span>
                <span className="block text-sm">
                  <Figure value={member.income} />{' '}
                  <span className="text-muted">{t.overview.received}</span>
                </span>
              </Row>
            ))}
          </Rows>
        </Panel>
      ) : null}
    </>
  );
}

export function OverviewView({
  data,
  evolution,
  t,
}: {
  readonly data: Overview;
  readonly evolution: EvolutionView;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.overview.title} month={data.month} t={t} />
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) => <CurrencyOverview entry={entry} data={data} evolution={evolution} t={t} />}
      </CurrencySections>
    </>
  );
}
