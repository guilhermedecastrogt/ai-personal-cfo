import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  AccountsView as Accounts,
  ReviewView as Review,
  TransactionsView as Transactions,
} from '@/lib/contracts';
import { Badge, Empty, Figure, PageHeading, Panel, Row, Rows } from '../ui';

const ACCOUNT_TYPE: Record<Accounts['accounts'][number]['type'], string> = {
  BANK: 'Bank account',
  CASH: 'Cash',
  CREDIT_CARD: 'Credit card',
  SAVINGS: 'Savings',
};

const TRANSACTION_TYPE: Record<Transactions['transactions'][number]['type'], string> = {
  EXPENSE: 'Expense',
  INCOME: 'Income',
  TRANSFER: 'Transfer',
};

function Points({
  title,
  points,
}: {
  readonly title: string;
  readonly points: readonly string[];
}): ReactNode {
  return points.length === 0 ? null : (
    <Panel title={title}>
      <ul className="list-disc space-y-2 pl-5">
        {points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
    </Panel>
  );
}

export function ReviewView({ data }: { readonly data: Review }): ReactNode {
  return (
    <>
      <PageHeading title="Monthly review" month={data.month} />
      <div className="space-y-6">
        <section className="rounded-xl bg-ink p-6 text-white sm:p-8">
          <p className="font-display text-xl leading-relaxed sm:text-2xl">{data.summary}</p>
          <p className="mt-4 text-sm text-white/60">
            {data.source === 'AI'
              ? 'Written from the calculated figures. Every number was checked against them.'
              : 'Shown in its plain form, built directly from the calculated figures.'}
          </p>
        </section>
        <Points title="Going well" points={data.strengths} />
        <Points title="Needs attention" points={data.concerns} />
        <Points title="Suggestions" points={data.recommendations} />
        {data.priorities.length === 0 ? null : (
          <Panel title="What to do first">
            <ol className="list-decimal space-y-2 pl-5">
              {data.priorities.map((priority) => (
                <li key={priority}>{priority}</li>
              ))}
            </ol>
          </Panel>
        )}
      </div>
    </>
  );
}

export interface TransactionQuery {
  readonly type?: string | undefined;
  readonly category?: string | undefined;
  readonly account?: string | undefined;
  readonly member?: string | undefined;
}

function pageLink(data: Transactions, query: TransactionQuery, page: number): string {
  const parameters = new URLSearchParams({ month: data.month.key, page: String(page) });
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') {
      parameters.set(name, value);
    }
  }
  return `/transactions?${parameters.toString()}`;
}

function Filter({
  name,
  label,
  selected,
  options,
}: {
  readonly name: string;
  readonly label: string;
  readonly selected: string | undefined;
  readonly options: readonly { readonly key: string; readonly name: string }[];
}): ReactNode {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <select
        name={name}
        defaultValue={selected ?? ''}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5"
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TransactionsView({
  data,
  query,
}: {
  readonly data: Transactions;
  readonly query: TransactionQuery;
}): ReactNode {
  return (
    <>
      <PageHeading title="Transactions" month={data.month} />
      <form method="get" action="/transactions" className="mb-6 flex flex-wrap items-end gap-3">
        <input type="hidden" name="month" value={data.month.key} />
        <Filter
          name="type"
          label="Type"
          selected={query.type}
          options={data.filters.types.map((type) => ({ key: type, name: type.toLowerCase() }))}
        />
        <Filter
          name="category"
          label="Category"
          selected={query.category}
          options={data.filters.categories}
        />
        <Filter
          name="account"
          label="Account"
          selected={query.account}
          options={data.filters.accounts}
        />
        <Filter
          name="member"
          label="Member"
          selected={query.member}
          options={data.filters.members}
        />
        <button type="submit" className="rounded-lg bg-ink px-4 py-1.5 text-white">
          Apply
        </button>
      </form>
      {data.transactions.length === 0 ? (
        <Empty>No transactions match for {data.month.label}.</Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full min-w-[44rem] text-left text-sm">
            <caption className="sr-only">Transactions for {data.month.label}</caption>
            <thead className="border-b border-line text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  What
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Category
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Account
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Member
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.transactions.map((transaction, position) => (
                <tr key={`${transaction.date}-${String(position)}`}>
                  <td className="figure px-4 py-3 whitespace-nowrap">{transaction.date}</td>
                  <td className="px-4 py-3">
                    {transaction.merchant ??
                      transaction.description ??
                      TRANSACTION_TYPE[transaction.type]}
                    <span className="ml-2 text-muted">
                      {TRANSACTION_TYPE[transaction.type]}
                      {transaction.type === 'EXPENSE' && transaction.expenseScope === 'INDIVIDUAL'
                        ? ' · individual'
                        : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3">{transaction.category ?? '—'}</td>
                  <td className="px-4 py-3">
                    {transaction.account}
                    {transaction.transferAccount === null
                      ? ''
                      : ` → ${transaction.transferAccount}`}
                  </td>
                  <td className="px-4 py-3">{transaction.member}</td>
                  <td className="px-4 py-3 text-right">
                    <Figure
                      value={transaction.amount}
                      tone={transaction.type === 'INCOME' ? 'kept' : 'neutral'}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <nav aria-label="Pages" className="mt-4 flex items-center justify-between text-sm text-muted">
        <span>
          {data.total} transactions · page {data.page} of {data.pageCount}
        </span>
        <span className="flex gap-4">
          {data.page > 1 ? (
            <Link
              href={pageLink(data, query, data.page - 1)}
              className="underline underline-offset-4"
            >
              Previous
            </Link>
          ) : null}
          {data.page < data.pageCount ? (
            <Link
              href={pageLink(data, query, data.page + 1)}
              className="underline underline-offset-4"
            >
              Next
            </Link>
          ) : null}
        </span>
      </nav>
    </>
  );
}

export function AccountsView({ data }: { readonly data: Accounts }): ReactNode {
  const severalCurrencies = data.totals.length > 1;
  return (
    <>
      <PageHeading title="Accounts">
        <p className="mt-2 text-muted">Balances as they stand on {data.today}.</p>
      </PageHeading>
      <div className="space-y-6">
        {data.accounts.length === 0 ? (
          <Empty>This household has no accounts yet.</Empty>
        ) : (
          <Panel title="Accounts">
            <Rows>
              {data.accounts.map((account) => (
                <Row
                  key={account.name}
                  label={account.name}
                  detail={
                    <>
                      {ACCOUNT_TYPE[account.type]} · {account.currency} ·{' '}
                      {account.isJoint ? <Badge tone="neutral">Joint</Badge> : account.owner}
                    </>
                  }
                >
                  <Figure
                    value={account.balance}
                    tone={account.balance.minor < 0 ? 'concern' : 'neutral'}
                  />
                </Row>
              ))}
            </Rows>
          </Panel>
        )}
        {severalCurrencies ? (
          <p className="rounded-lg border border-line bg-surface px-4 py-3 text-sm text-muted">
            Totals are kept per currency and are never added together.
          </p>
        ) : null}
        {data.totals.map((totals) => (
          <Panel key={totals.currency} title={`Totals in ${totals.currency}`}>
            <Rows>
              <Row label="All accounts">
                <Figure value={totals.total} />
              </Row>
              <Row label="Joint">
                <Figure value={totals.joint} />
              </Row>
              {totals.byMember.map((member) => (
                <Row key={member.member} label={member.member}>
                  <Figure value={member.total} />
                </Row>
              ))}
            </Rows>
          </Panel>
        ))}
        <Panel title="Members" note="Everyone in the household sees the same figures">
          <ul className="flex flex-wrap gap-2">
            {data.members.map((member) => (
              <li key={member.name} className="rounded-full bg-mist px-3 py-1 text-sm">
                {member.name}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
