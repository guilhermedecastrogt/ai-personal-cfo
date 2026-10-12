import Link from 'next/link';
import type { ReactNode } from 'react';
import type { CategoryView as Category } from '@/lib/contracts';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { MonthBars } from '../charts';
import {
  Badge,
  CategoryLink,
  categoryHref,
  Change,
  CurrencySections,
  Empty,
  Figure,
  PageHeading,
  Panel,
  Row,
  Rows,
  Share,
  Stat,
} from '../ui';
import { BudgetList } from './budget-list';
import { Categories } from './flow-views';
import { TransactionList } from './record-views';

export function CategoryView({
  data,
  t,
}: {
  readonly data: Category;
  readonly t: Dictionary;
}): ReactNode {
  const { category, month } = data;
  const isIncome = category.kind === 'INCOME';
  const transactionsHref = `/transactions?${new URLSearchParams({
    month: month.key,
    category: category.key,
  }).toString()}`;
  return (
    <>
      <PageHeading title={category.name} month={month} t={t}>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
          <Badge tone="neutral">{t.categories.kinds[category.kind]}</Badge>
          {category.parent === null ? null : (
            <span>
              {t.categories.partOf}{' '}
              <CategoryLink
                name={category.parent.name}
                categoryKey={category.parent.key}
                month={month.key}
                className="text-ink"
              />
            </span>
          )}
          <Link
            href={transactionsHref}
            className="font-medium text-accent underline decoration-brass underline-offset-4"
          >
            {t.categories.openTransactions}
          </Link>
        </div>
        {category.children.length === 0 ? null : (
          <nav aria-label={t.categories.subcategories} className="mt-5 flex flex-wrap gap-2">
            {category.children.map((child) => (
              <Link
                key={child.key}
                href={categoryHref(child.key, month.key)}
                className="rounded-full border border-line bg-surface px-3.5 py-1 text-sm text-ink-soft hover:border-brass/50 hover:text-ink"
              >
                {child.name}
              </Link>
            ))}
          </nav>
        )}
      </PageHeading>
      {data.currencies.length === 0 ? (
        <Empty>{t.categories.nothing(category.name, month.label)}</Empty>
      ) : (
        <CurrencySections entries={data.currencies} t={t}>
          {(entry) => (
            <>
              <section className="grid gap-8 rounded-2xl border border-line bg-surface p-5 shadow-panel sm:p-7 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
                <div className="min-w-0">
                  <Stat
                    label={t.categories.total}
                    value={entry.total}
                    tone={isIncome ? 'kept' : 'neutral'}
                    detail={<Change comparison={entry.comparison} risingIsGood={isIncome} t={t} />}
                  />
                  <p className="mt-3 text-sm text-muted">
                    {entry.share === null
                      ? null
                      : `${t.categories.shareOfMonth(category.kind, entry.share.text)} · `}
                    {t.common.transactions(entry.transactionCount)}
                  </p>
                </div>
                <div className="min-w-0">
                  <p className="eyebrow mb-3 text-muted">{t.categories.evolutionTitle}</p>
                  <MonthBars
                    months={entry.months}
                    tone={isIncome ? 'kept' : 'brass'}
                    caption={t.categories.evolutionNote(month.label)}
                    t={t}
                  />
                </div>
              </section>
              {entry.transactionCount === 0 ? (
                <Empty>{t.categories.nothing(category.name, month.label)}</Empty>
              ) : (
                <div className="grid gap-6 lg:grid-cols-2">
                  {category.children.length === 0 ? null : (
                    <Panel title={t.categories.subcategories} note={t.categories.subcategoriesNote}>
                      {entry.subcategories.length === 0 ? (
                        <Empty>{t.categories.noSubcategoryMovement}</Empty>
                      ) : (
                        <Categories
                          rows={entry.subcategories}
                          root={category.key}
                          month={month.key}
                          t={t}
                        />
                      )}
                    </Panel>
                  )}
                  <Panel title={t.categories.byMember}>
                    <Rows>
                      {entry.byMember.map((member) => (
                        <Row
                          key={member.member}
                          label={member.member}
                          detail={<Share value={member.share} />}
                        >
                          <Figure value={member.total} />
                        </Row>
                      ))}
                    </Rows>
                  </Panel>
                </div>
              )}
              {entry.budgets.length === 0 ? null : (
                <Panel title={t.categories.budgets}>
                  <BudgetList
                    budgets={entry.budgets}
                    editHref={(key) => `/budgets/${key}?month=${month.key}`}
                    month={month.key}
                    t={t}
                  />
                </Panel>
              )}
            </>
          )}
        </CurrencySections>
      )}
      <section aria-labelledby="category-transactions" className="mt-12">
        <header className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <h2
              id="category-transactions"
              className="font-display text-xl tracking-tight sm:text-[1.375rem]"
            >
              {t.categories.transactions}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.categories.latest(month.label)}</p>
          </div>
          {data.transactions.total > data.transactions.rows.length ? (
            <Link
              href={transactionsHref}
              className="text-sm font-medium text-accent underline decoration-brass underline-offset-4"
            >
              {t.categories.seeAll(data.transactions.total)}
            </Link>
          ) : null}
        </header>
        {data.transactions.rows.length === 0 ? (
          <Empty>{t.categories.noTransactions(month.label)}</Empty>
        ) : (
          <TransactionList
            rows={data.transactions.rows}
            caption={t.transactions.caption(month.label)}
            listPath={categoryHref(category.key, month.key)}
            month={month.key}
            t={t}
          />
        )}
      </section>
    </>
  );
}
