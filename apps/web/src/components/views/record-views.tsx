import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  AccountsView as Accounts,
  ReviewView as Review,
  TransactionsView as Transactions,
} from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { Badge, Empty, Figure, PageHeading, Panel, Row, Rows } from '../ui';

function Points({
  title,
  points,
}: {
  readonly title: string;
  readonly points: readonly string[];
}): ReactNode {
  return points.length === 0 ? null : (
    <Panel title={title}>
      <ul className="space-y-3">
        {points.map((point) => (
          <li key={point} className="flex gap-3">
            <span aria-hidden="true" className="mt-2.5 h-1 w-3 shrink-0 rounded-full bg-brass" />
            <span>{point}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

export function ReviewView({
  data,
  t,
}: {
  readonly data: Review;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <PageHeading title={t.review.title} month={data.month} t={t} />
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-3xl bg-hero p-6 text-hero-ink shadow-panel sm:p-9">
          <div
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brass to-transparent"
          />
          <p className="font-display text-xl leading-relaxed sm:text-2xl">{data.summary}</p>
          <p className="mt-5 text-sm text-hero-muted">
            {data.source === 'AI' ? t.review.aiSource : t.review.plainSource}
          </p>
        </section>
        <Points title={t.review.goingWell} points={data.strengths} />
        <Points title={t.review.needsAttention} points={data.concerns} />
        <Points title={t.review.suggestions} points={data.recommendations} />
        {data.priorities.length === 0 ? null : (
          <Panel title={t.review.first}>
            <ol className="space-y-3">
              {data.priorities.map((priority, position) => (
                <li key={priority} className="flex gap-3">
                  <span className="figure grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent text-xs text-accent-ink">
                    {position + 1}
                  </span>
                  <span>{priority}</span>
                </li>
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

type TransactionRow = Transactions['transactions'][number];

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
  t,
}: {
  readonly name: string;
  readonly label: string;
  readonly selected: string | undefined;
  readonly options: readonly { readonly key: string; readonly name: string }[];
  readonly t: Dictionary;
}): ReactNode {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="eyebrow text-muted">{label}</span>
      <select
        name={name}
        defaultValue={selected ?? ''}
        className="h-10 w-full rounded-xl border border-line bg-surface px-3"
      >
        <option value="">{t.transactions.all}</option>
        {options.map((option) => (
          <option key={option.key} value={option.key}>
            {option.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function describeTransaction(transaction: TransactionRow, t: Dictionary): string {
  return transaction.merchant ?? transaction.description ?? t.transactions.types[transaction.type];
}

function kindOf(transaction: TransactionRow, t: Dictionary): string {
  return `${t.transactions.types[transaction.type]}${
    transaction.type === 'EXPENSE' && transaction.expenseScope === 'INDIVIDUAL'
      ? t.transactions.individual
      : ''
  }`;
}

function accountOf(transaction: TransactionRow): string {
  return `${transaction.account}${
    transaction.transferAccount === null ? '' : ` → ${transaction.transferAccount}`
  }`;
}

function TransactionCards({
  rows,
  t,
}: {
  readonly rows: readonly TransactionRow[];
  readonly t: Dictionary;
}): ReactNode {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-panel md:hidden">
      {rows.map((transaction, position) => (
        <li key={`${transaction.date}-${String(position)}`} className="flex gap-3 px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{describeTransaction(transaction, t)}</p>
            <p className="mt-0.5 truncate text-sm text-muted">
              {transaction.category ?? kindOf(transaction, t)} · {transaction.member}
            </p>
            <p className="mt-0.5 truncate text-xs text-muted">
              <span className="figure">{t.date(transaction.date)}</span> · {accountOf(transaction)}
            </p>
          </div>
          <p className="shrink-0 text-right font-medium">
            <Figure
              value={transaction.amount}
              tone={transaction.type === 'INCOME' ? 'kept' : 'neutral'}
            />
          </p>
        </li>
      ))}
    </ul>
  );
}

function TransactionTable({
  data,
  t,
}: {
  readonly data: Transactions;
  readonly t: Dictionary;
}): ReactNode {
  const heading = 'eyebrow px-4 py-3 text-left text-muted';
  return (
    <div className="hidden overflow-hidden rounded-2xl border border-line bg-surface shadow-panel md:block">
      <table className="w-full text-left text-sm">
        <caption className="sr-only">{t.transactions.caption(data.month.label)}</caption>
        <thead className="border-b border-line">
          <tr>
            <th scope="col" className={heading}>
              {t.transactions.date}
            </th>
            <th scope="col" className={heading}>
              {t.transactions.what}
            </th>
            <th scope="col" className={heading}>
              {t.transactions.category}
            </th>
            <th scope="col" className={heading}>
              {t.transactions.account}
            </th>
            <th scope="col" className={heading}>
              {t.transactions.member}
            </th>
            <th scope="col" className={`${heading} text-right`}>
              {t.transactions.amount}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.transactions.map((transaction, position) => (
            <tr key={`${transaction.date}-${String(position)}`} className="hover:bg-raised">
              <td className="figure px-4 py-3 text-muted">{t.date(transaction.date)}</td>
              <td className="px-4 py-3">
                <span className="font-medium">{describeTransaction(transaction, t)}</span>
                <span className="ml-2 text-muted">{kindOf(transaction, t)}</span>
              </td>
              <td className="px-4 py-3">{transaction.category ?? '—'}</td>
              <td className="px-4 py-3">{accountOf(transaction)}</td>
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
  );
}

export function TransactionsView({
  data,
  query,
  t,
}: {
  readonly data: Transactions;
  readonly query: TransactionQuery;
  readonly t: Dictionary;
}): ReactNode {
  const filtered = Object.values(query).some((value) => value !== undefined && value !== '');
  return (
    <>
      <PageHeading title={t.transactions.title} month={data.month} t={t} />
      <details
        open={filtered}
        className="group mb-6 rounded-2xl border border-line bg-surface shadow-panel md:open:pb-0"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-sm font-medium">
          {t.transactions.filters}
          <span aria-hidden="true" className="text-muted transition group-open:rotate-180">
            ▾
          </span>
        </summary>
        <form
          method="get"
          action="/transactions"
          className="grid grid-cols-2 gap-3 border-t border-line px-5 pb-5 pt-4 md:grid-cols-5 md:items-end"
        >
          <input type="hidden" name="month" value={data.month.key} />
          <Filter
            name="type"
            label={t.transactions.type}
            selected={query.type}
            options={data.filters.types.map((type) => ({
              key: type,
              name: t.transactions.types[type as TransactionRow['type']],
            }))}
            t={t}
          />
          <Filter
            name="category"
            label={t.transactions.category}
            selected={query.category}
            options={data.filters.categories}
            t={t}
          />
          <Filter
            name="account"
            label={t.transactions.account}
            selected={query.account}
            options={data.filters.accounts}
            t={t}
          />
          <Filter
            name="member"
            label={t.transactions.member}
            selected={query.member}
            options={data.filters.members}
            t={t}
          />
          <button
            type="submit"
            className="col-span-2 h-10 rounded-xl bg-accent px-4 font-medium text-accent-ink md:col-span-1"
          >
            {t.transactions.apply}
          </button>
        </form>
      </details>
      {data.transactions.length === 0 ? (
        <Empty>{t.transactions.none(data.month.label)}</Empty>
      ) : (
        <>
          <TransactionCards rows={data.transactions} t={t} />
          <TransactionTable data={data} t={t} />
        </>
      )}
      <nav
        aria-label={t.transactions.pages}
        className="mt-5 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"
      >
        <span>{t.transactions.summary(data.total, data.page, data.pageCount)}</span>
        <span className="flex gap-2">
          {data.page > 1 ? (
            <Link
              href={pageLink(data, query, data.page - 1)}
              className="rounded-full border border-line px-4 py-2 text-ink hover:bg-raised"
            >
              {t.transactions.previous}
            </Link>
          ) : null}
          {data.page < data.pageCount ? (
            <Link
              href={pageLink(data, query, data.page + 1)}
              className="rounded-full border border-line px-4 py-2 text-ink hover:bg-raised"
            >
              {t.transactions.next}
            </Link>
          ) : null}
        </span>
      </nav>
    </>
  );
}

export function AccountsView({
  data,
  t,
}: {
  readonly data: Accounts;
  readonly t: Dictionary;
}): ReactNode {
  const severalCurrencies = data.totals.length > 1;
  return (
    <>
      <PageHeading title={t.accounts.title} t={t}>
        <p className="mt-2 text-muted">{t.accounts.asOf(t.date(data.today))}</p>
      </PageHeading>
      <div className="space-y-6">
        {data.accounts.length === 0 ? (
          <Empty>{t.accounts.none}</Empty>
        ) : (
          <Panel title={t.accounts.title}>
            <Rows>
              {data.accounts.map((account) => (
                <Row
                  key={account.name}
                  label={account.name}
                  detail={
                    <>
                      {t.accounts.types[account.type]} · {account.currency} ·{' '}
                      {account.isJoint ? (
                        <Badge tone="neutral">{t.accounts.joint}</Badge>
                      ) : (
                        account.owner
                      )}
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
          <p className="rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
            {t.accounts.perCurrency}
          </p>
        ) : null}
        {data.totals.map((totals) => (
          <Panel key={totals.currency} title={t.accounts.totalsIn(totals.currency)}>
            <Rows>
              <Row label={t.accounts.allAccounts}>
                <Figure value={totals.total} />
              </Row>
              <Row label={t.accounts.joint}>
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
        <Panel title={t.accounts.members} note={t.accounts.membersNote}>
          <ul className="flex flex-wrap gap-2">
            {data.members.map((member) => (
              <li
                key={member.name}
                className="rounded-full border border-line bg-raised px-3.5 py-1.5 text-sm"
              >
                {member.name}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
