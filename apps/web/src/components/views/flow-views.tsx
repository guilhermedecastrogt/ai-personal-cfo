import type { ReactNode } from 'react';
import type { Comparison, IncomeView as Income, SpendingView as Spending } from '@/lib/contracts';
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

type CategoryRow = Spending['currencies'][number]['byCategory'][number];
type MemberRow = Spending['currencies'][number]['byMember'][number];

function Categories({ rows }: { readonly rows: readonly CategoryRow[] }): ReactNode {
  if (rows.length === 0) {
    return <Empty>Nothing recorded.</Empty>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((row) => (
        <li key={row.category} className={row.isTopLevel ? '' : 'pl-5 text-sm'}>
          <div className="mb-1 flex items-baseline justify-between gap-4">
            <span className={row.isTopLevel ? 'font-medium' : 'text-muted'}>{row.category}</span>
            <span>
              <Figure value={row.total} /> <Share value={row.share} />
            </span>
          </div>
          {row.isTopLevel ? <Meter value={row.share} label={`${row.category} share`} /> : null}
        </li>
      ))}
    </ul>
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
}: {
  readonly label: string;
  readonly total: Spending['currencies'][number]['total'];
  readonly count: number;
  readonly comparison: Comparison | null;
  readonly risingIsGood: boolean;
}): ReactNode {
  return (
    <Panel title={label} note={`${String(count)} transactions`}>
      <p className="text-3xl">
        <Figure value={total} />
      </p>
      <p className="mt-2 text-sm">
        {comparison === null ? (
          <span className="text-muted">There is no earlier period to compare with yet.</span>
        ) : (
          <Change comparison={comparison} risingIsGood={risingIsGood} />
        )}
      </p>
    </Panel>
  );
}

function Changes({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: Spending['currencies'][number]['categoryIncreases'];
}): ReactNode {
  return (
    <Panel title={title}>
      {rows.length === 0 ? (
        <Empty>No category moved by a meaningful amount.</Empty>
      ) : (
        <Rows>
          {rows.map((row) => (
            <Row key={row.category} label={row.category} detail={<Figure value={row.current} />}>
              <Change comparison={row} risingIsGood={false} />
            </Row>
          ))}
        </Rows>
      )}
    </Panel>
  );
}

export function SpendingView({ data }: { readonly data: Spending }): ReactNode {
  return (
    <>
      <PageHeading title="Spending" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) =>
          entry.transactionCount === 0 ? (
            <Empty>No spending is recorded for {data.month.label}.</Empty>
          ) : (
            <>
              <Total
                label="Total spending"
                total={entry.total}
                count={entry.transactionCount}
                comparison={entry.comparison}
                risingIsGood={false}
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="By category">
                  <Categories rows={entry.byCategory} />
                </Panel>
                <div className="space-y-6">
                  <Panel title="By member">
                    <Members rows={entry.byMember} />
                  </Panel>
                  <Panel title="By account">
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
                  <Changes title="Rose most" rows={entry.categoryIncreases} />
                  <Changes title="Fell most" rows={entry.categoryDecreases} />
                </div>
              )}
              <Panel title="Largest expenses">
                <Rows>
                  {entry.largestExpenses.map((expense, position) => (
                    <Row
                      key={`${expense.date}-${String(position)}`}
                      label={expense.merchant ?? expense.category}
                      detail={`${expense.date} · ${expense.category} · ${expense.member}`}
                    >
                      <Figure value={expense.amount} />
                    </Row>
                  ))}
                </Rows>
              </Panel>
            </>
          )
        }
      </CurrencySections>
    </>
  );
}

export function IncomeView({ data }: { readonly data: Income }): ReactNode {
  return (
    <>
      <PageHeading title="Income" month={data.month} />
      <CurrencySections entries={data.currencies}>
        {(entry) =>
          entry.transactionCount === 0 ? (
            <Empty>No income is recorded for {data.month.label}.</Empty>
          ) : (
            <>
              <Total
                label="Total income"
                total={entry.total}
                count={entry.transactionCount}
                comparison={entry.comparison}
                risingIsGood
              />
              <div className="grid gap-6 lg:grid-cols-2">
                <Panel title="By source">
                  <Categories rows={entry.byCategory} />
                </Panel>
                <Panel title="By member">
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
