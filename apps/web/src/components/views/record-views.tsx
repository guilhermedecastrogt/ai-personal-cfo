import Link from 'next/link';
import type { ReactNode } from 'react';
import type {
  TransactionSort,
  AccountsView as Accounts,
  ReviewView as Review,
  TransactionsView as Transactions,
} from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import type { TransactionQuery } from '@/lib/transaction-query';
import { Icon } from '../icons';
import { Badge, Empty, Figure, PageHeading, Panel, Row, Rows } from '../ui';

const SORTS: readonly TransactionSort[] = ['date_desc', 'date_asc', 'amount_desc', 'amount_asc'];

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

export type { TransactionQuery };

type TransactionRow = Transactions['transactions'][number];

function queryString(
  data: Transactions,
  query: TransactionQuery,
  page: number | undefined,
): string {
  const parameters = new URLSearchParams({ month: data.month.key });
  if (page !== undefined) {
    parameters.set('page', String(page));
  }
  for (const [name, value] of Object.entries(query)) {
    if (typeof value === 'string' && value !== '') {
      parameters.set(name, value);
    }
  }
  return parameters.toString();
}

function pageLink(data: Transactions, query: TransactionQuery, page: number): string {
  return `/transactions?${queryString(data, query, page)}`;
}

function exportLink(data: Transactions, query: TransactionQuery): string {
  return `/transactions/export?${queryString(data, query, undefined)}`;
}

function DateField({
  name,
  label,
  value,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string | undefined;
}): ReactNode {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm">
      <span className="eyebrow text-muted">{label}</span>
      <input
        type="date"
        name={name}
        defaultValue={value ?? ''}
        className="h-10 w-full rounded-xl border border-line bg-surface px-3"
      />
    </label>
  );
}

function editLink(transaction: TransactionRow, listPath: string): string {
  const parameters = new URLSearchParams({ back: listPath });
  return `/transactions/${encodeURIComponent(transaction.key)}?${parameters.toString()}`;
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
  listPath,
  t,
}: {
  readonly rows: readonly TransactionRow[];
  readonly listPath: string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-panel md:hidden">
      {rows.map((transaction) => (
        <li key={transaction.key}>
          <Link
            href={editLink(transaction, listPath)}
            aria-label={t.editing.editItem(describeTransaction(transaction, t))}
            className="flex gap-3 px-4 py-3.5 active:bg-raised"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{describeTransaction(transaction, t)}</p>
              <p className="mt-0.5 truncate text-sm text-muted">
                {transaction.category ?? kindOf(transaction, t)} · {transaction.member}
              </p>
              <p className="mt-0.5 truncate text-xs text-muted">
                <span className="figure">{t.date(transaction.date)}</span> ·{' '}
                {accountOf(transaction)}
              </p>
            </div>
            <p className="shrink-0 text-right font-medium">
              <Figure
                value={transaction.amount}
                tone={transaction.type === 'INCOME' ? 'kept' : 'neutral'}
              />
            </p>
            <Icon name="chevron-right" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

function TransactionTable({
  data,
  listPath,
  t,
}: {
  readonly data: Transactions;
  readonly listPath: string;
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
            <th scope="col" className={heading}>
              <span className="sr-only">{t.editing.edit}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {data.transactions.map((transaction) => (
            <tr key={transaction.key} className="hover:bg-raised">
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
              <td className="py-1.5 pr-3 text-right">
                <Link
                  href={editLink(transaction, listPath)}
                  aria-label={t.editing.editItem(describeTransaction(transaction, t))}
                  className="inline-grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-surface hover:text-ink"
                >
                  <Icon name="edit" className="h-4 w-4" />
                </Link>
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
  invalidRange = false,
  t,
}: {
  readonly data: Transactions;
  readonly query: TransactionQuery;
  readonly invalidRange?: boolean;
  readonly t: Dictionary;
}): ReactNode {
  const filtered =
    [query.type, query.category, query.account, query.member, query.from, query.to].some(
      (value) => value !== undefined && value !== '',
    ) ||
    (query.sort !== undefined && query.sort !== 'date_desc');
  const searching = filtered || (query.q !== undefined && query.q !== '');
  return (
    <>
      <PageHeading
        title={t.transactions.title}
        month={data.range === null ? data.month : undefined}
        t={t}
      >
        {data.range === null ? null : (
          <p className="mt-3 text-muted">
            {t.search.range(t.date(data.range.start), t.date(data.range.end))}
          </p>
        )}
      </PageHeading>
      <form
        method="get"
        action="/transactions"
        role="search"
        className="mb-4 rounded-2xl border border-line bg-surface shadow-panel"
      >
        <input type="hidden" name="month" value={data.month.key} />
        <div className="flex items-center gap-2 py-2 pl-4 pr-2">
          <Icon name="search" className="h-[18px] w-[18px] shrink-0 text-muted" />
          <label className="min-w-0 flex-1">
            <span className="sr-only">{t.search.label}</span>
            <input
              type="search"
              name="q"
              defaultValue={query.q ?? ''}
              maxLength={100}
              placeholder={t.search.placeholder}
              className="h-10 w-full bg-transparent text-[0.9375rem] placeholder:text-muted"
            />
          </label>
          <button
            type="submit"
            className="h-9 shrink-0 rounded-xl bg-accent px-4 text-sm font-medium text-accent-ink"
          >
            {t.search.label}
          </button>
        </div>
        <details open={filtered} className="group border-t border-line">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium">
            {t.transactions.filters}
            <span aria-hidden="true" className="text-muted transition group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="grid grid-cols-2 gap-3 border-t border-line px-5 pb-5 pt-4 md:grid-cols-4 md:items-end">
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
            <DateField name="from" label={t.search.from} value={data.range?.start} />
            <DateField name="to" label={t.search.to} value={data.range?.end} />
            <label className="flex min-w-0 flex-col gap-1.5 text-sm">
              <span className="eyebrow text-muted">{t.search.sort}</span>
              <select
                name="sort"
                defaultValue={data.sort}
                className="h-10 w-full rounded-xl border border-line bg-surface px-3"
              >
                {SORTS.map((sort) => (
                  <option key={sort} value={sort}>
                    {t.search.sorts[sort]}
                  </option>
                ))}
              </select>
            </label>
            <span className="flex gap-2">
              <button
                type="submit"
                className="h-10 flex-1 rounded-xl bg-accent px-4 font-medium text-accent-ink"
              >
                {t.transactions.apply}
              </button>
              {searching ? (
                <Link
                  href={`/transactions?month=${data.month.key}`}
                  className="grid h-10 place-items-center rounded-xl border border-line px-4 text-sm hover:bg-raised"
                >
                  {t.search.clear}
                </Link>
              ) : null}
            </span>
          </div>
        </details>
      </form>
      {invalidRange ? (
        <p role="alert" className="mb-4 rounded-xl bg-caution-soft px-4 py-3 text-sm text-caution">
          {t.search.invalidRange}
        </p>
      ) : null}
      <div className="mb-4 flex justify-end">
        <a
          href={exportLink(data, query)}
          download
          className="inline-flex items-center gap-2 rounded-full border border-line px-4 py-2 text-sm text-ink-soft hover:bg-raised hover:text-ink"
        >
          <Icon name="download" className="h-4 w-4" />
          {t.search.export}
        </a>
      </div>
      {data.transactions.length === 0 ? (
        <Empty>{searching ? t.search.noMatches : t.transactions.none(data.month.label)}</Empty>
      ) : (
        <>
          <TransactionCards
            rows={data.transactions}
            listPath={pageLink(data, query, data.page)}
            t={t}
          />
          <TransactionTable data={data} listPath={pageLink(data, query, data.page)} t={t} />
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
