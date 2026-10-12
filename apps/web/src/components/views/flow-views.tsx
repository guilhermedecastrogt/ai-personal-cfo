import type { ReactNode } from 'react';
import type {
  CategoryRowView,
  Comparison,
  IncomeView as Income,
  SpendingView as Spending,
} from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import {
  CategoryLink,
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
import { CompositionRing } from '../charts';

type MemberRow = Spending['currencies'][number]['byMember'][number];
type LargestExpense = Spending['currencies'][number]['largestExpenses'][number];

export function Categories({
  rows,
  month,
  root,
  t,
}: {
  readonly rows: readonly CategoryRowView[];
  readonly month: string;
  readonly root?: string;
  readonly t: Dictionary;
}): ReactNode {
  if (rows.length === 0) {
    return <Empty>{t.flow.nothingRecorded}</Empty>;
  }
  return (
    <ul className="space-y-3.5">
      {rows.map((row) => {
        const lead = root === undefined ? row.isTopLevel : row.parentKey === root;
        const share = lead && root === undefined ? row.share : row.shareOfParent;
        return (
          <li
            key={row.categoryKey ?? row.category}
            className={lead ? '' : 'ml-1.5 border-l-2 border-line pl-4 text-sm'}
          >
            <div className="mb-1.5 flex items-baseline justify-between gap-4">
              <CategoryLink
                name={row.category}
                categoryKey={row.categoryKey}
                month={month}
                className={`min-w-0 break-words ${lead ? 'font-medium' : 'text-ink-soft'}`}
              />
              <span className="shrink-0">
                <Figure value={row.total} /> <Share value={share} />
              </span>
            </div>
            <Meter
              value={share}
              thin={!lead}
              label={lead ? t.flow.share(row.category) : t.categories.shareOfParent(row.category)}
              t={t}
            />
          </li>
        );
      })}
    </ul>
  );
}

export function LargestExpenses({
  rows,
  month,
  detailOf,
  t,
}: {
  readonly rows: readonly LargestExpense[];
  readonly month: string;
  readonly detailOf: (expense: LargestExpense) => string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <Rows>
      {rows.map((expense, position) => (
        <Row
          key={`${expense.date}-${String(position)}`}
          label={expense.merchant ?? expense.category}
          detail={
            <>
              {t.date(expense.date)} ·{' '}
              <CategoryLink
                name={expense.category}
                categoryKey={expense.categoryKey}
                month={month}
              />{' '}
              · {detailOf(expense)}
            </>
          }
        >
          <Figure value={expense.amount} />
        </Row>
      ))}
    </Rows>
  );
}

function Members({ rows }: { readonly rows: readonly MemberRow[] }): ReactNode {
  return (
    <Rows>
      {rows.map((row) => (
        <Row key={row.member} label={row.member} detail={<Share value={row.share} />}>
          <Figure value={row.total} />
        </Row>
      ))}
    </Rows>
  );
}

function Total({
  label,
  total,
  count,
  comparison,
  risingIsGood,
  t,
}: {
  readonly label: string;
  readonly total: Spending['currencies'][number]['total'];
  readonly count: number;
  readonly comparison: Comparison | null;
  readonly risingIsGood: boolean;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <Panel title={label} note={t.common.transactions(count)}>
      <p className="font-display text-4xl tracking-tight sm:text-5xl">
        <Figure value={total} />
      </p>
      <p className="mt-3 text-sm">
        {comparison === null ? (
          <span className="text-muted">{t.common.noEarlierPeriod}</span>
        ) : (
          <Change comparison={comparison} risingIsGood={risingIsGood} t={t} />
        )}
      </p>
    </Panel>
  );
}

function Changes({
  title,
  rows,
  month,
  t,
}: {
  readonly title: string;
  readonly rows: Spending['currencies'][number]['categoryIncreases'];
  readonly month: string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <Empty>{t.flow.noMovement}</Empty>
      ) : (
        <Rows>
          {rows.map((row) => (
            <Row
              key={row.categoryKey ?? row.category}
              label={
                <CategoryLink name={row.category} categoryKey={row.categoryKey} month={month} />
              }
              detail={<Figure value={row.current} />}
            >
              <Change comparison={row} risingIsGood={false} t={t} />
            </Row>
          ))}
        </Rows>
      )}
    </Panel>
  );
}

export function SpendingView({
  data,
  t,
}: {
  readonly data: Spending;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.flow.spendingTitle} month={data.month} t={t} />
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) =>
          entry.transactionCount === 0 ? (
            <Empty>{t.flow.noSpending(data.month.label)}</Empty>
          ) : (
            <>
              <Total
                t={t}
                label={t.flow.totalSpending}
                total={entry.total}
                count={entry.transactionCount}
                comparison={entry.comparison}
                risingIsGood={false}
              />
              {entry.composition.length === 0 ? null : (
                <Panel title={t.charts.compositionTitle} note={t.charts.compositionNote}>
                  <CompositionRing
                    slices={entry.composition}
                    total={entry.total}
                    totalLabel={t.charts.spending}
                    month={data.month.key}
                    t={t}
                  />
                </Panel>
              )}
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title={t.flow.byCategory}>
                  <Categories rows={entry.byCategory} month={data.month.key} t={t} />
                </Panel>
                <div className="space-y-6">
                  <Panel title={t.flow.byMember}>
                    <Members rows={entry.byMember} />
                  </Panel>
                  <Panel title={t.flow.byAccount}>
                    <Rows>
                      {entry.byAccount.map((row) => (
                        <Row
                          key={row.account}
                          label={row.account}
                          detail={<Share value={row.share} />}
                        >
                          <Figure value={row.total} />
                        </Row>
                      ))}
                    </Rows>
                  </Panel>
                </div>
              </div>
              {entry.comparison === null ? null : (
                <div className="grid gap-6 lg:grid-cols-2">
                  <Changes
                    title={t.flow.roseMost}
                    rows={entry.categoryIncreases}
                    month={data.month.key}
                    t={t}
                  />
                  <Changes
                    title={t.flow.fellMost}
                    rows={entry.categoryDecreases}
                    month={data.month.key}
                    t={t}
                  />
                </div>
              )}
              <Panel title={t.flow.largestExpenses}>
                <LargestExpenses
                  rows={entry.largestExpenses}
                  month={data.month.key}
                  detailOf={(expense) => expense.member}
                  t={t}
                />
              </Panel>
            </>
          )
        }
      </CurrencySections>
    </>
  );
}

export function IncomeView({
  data,
  t,
}: {
  readonly data: Income;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.flow.incomeTitle} month={data.month} t={t} />
      <CurrencySections entries={data.currencies} t={t}>
        {(entry) =>
          entry.transactionCount === 0 ? (
            <Empty>{t.flow.noIncome(data.month.label)}</Empty>
          ) : (
            <>
              <Total
                t={t}
                label={t.flow.totalIncome}
                total={entry.total}
                count={entry.transactionCount}
                comparison={entry.comparison}
                risingIsGood
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title={t.flow.bySource}>
                  <Categories rows={entry.byCategory} month={data.month.key} t={t} />
                </Panel>
                <Panel title={t.flow.byMember}>
                  <Members rows={entry.byMember} />
                </Panel>
              </div>
            </>
          )
        }
      </CurrencySections>
    </>
  );
}
