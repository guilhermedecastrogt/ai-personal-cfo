import Link from 'next/link';
import type { ReactNode } from 'react';
import { deleteBudget } from '@/app/(dashboard)/budgets/actions';
import { deleteGoal } from '@/app/(dashboard)/goals/actions';
import { deleteTransaction } from '@/app/(dashboard)/transactions/actions';
import type {
  BudgetEditView,
  BudgetOptions,
  GoalEditView,
  GoalOptions,
  TransactionEditView,
} from '@/lib/contracts';
import type { Dictionary, Locale } from '@/lib/i18n/dictionary';
import { BudgetForm } from '../forms/budget-form';
import { ConfirmDelete } from '../forms/confirm-delete';
import { GoalForm } from '../forms/goal-form';
import { TransactionForm } from '../forms/transaction-form';
import { Icon } from '../icons';

function EditorFrame({
  title,
  intro,
  back,
  backLabel,
  aside,
  children,
}: {
  readonly title: string;
  readonly intro: ReactNode;
  readonly back: string;
  readonly backLabel: string;
  readonly aside?: ReactNode;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={back}
        className="mb-6 inline-flex h-10 items-center gap-1.5 rounded-full pr-3 text-sm text-muted hover:text-ink"
      >
        <Icon name="chevron-left" className="h-4 w-4" />
        {backLabel}
      </Link>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[2rem] leading-tight tracking-tight sm:text-[2.5rem]">
            {title}
          </h1>
          <p className="mt-2 text-muted">{intro}</p>
        </div>
        {aside}
      </header>
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-panel sm:p-7">
        {children}
      </section>
    </div>
  );
}

export function TransactionEditor({
  data,
  back,
  locale,
  t,
}: {
  readonly data: TransactionEditView;
  readonly back: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  const source = t.editing.transaction.sources[data.source];
  return (
    <EditorFrame
      title={t.editing.transaction.title}
      intro={
        <>
          {t.editing.transaction.intro}
          {source === undefined ? null : (
            <span className="mt-1 block text-sm">
              {t.editing.transaction.recordedFrom} {source}.
            </span>
          )}
        </>
      }
      back={back}
      backLabel={t.nav.transactions}
      aside={
        <ConfirmDelete
          action={deleteTransaction}
          fields={{ key: data.key, back }}
          name={data.merchant ?? data.description ?? t.editing.transaction.removeName}
          locale={locale}
        />
      }
    >
      <TransactionForm data={data} back={back} locale={locale} />
    </EditorFrame>
  );
}

export function BudgetEditor({
  data,
  back,
  locale,
  t,
}: {
  readonly data: BudgetEditView;
  readonly back: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  const { options, ...draft } = data;
  const category =
    options.categories.find((option) => option.key === data.categoryKey)?.name ??
    t.editing.budget.allSpending;
  return (
    <EditorFrame
      title={t.editing.budget.editTitle}
      intro={category}
      back={back}
      backLabel={t.nav.budgets}
      aside={
        <ConfirmDelete
          action={deleteBudget}
          fields={{ key: data.key, back }}
          name={category}
          locale={locale}
        />
      }
    >
      <BudgetForm draft={draft} options={options} back={back} locale={locale} />
    </EditorFrame>
  );
}

export function NewBudget({
  options,
  back,
  locale,
  t,
}: {
  readonly options: BudgetOptions;
  readonly back: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <EditorFrame
      title={t.editing.budget.newTitle}
      intro={t.editing.budget.intro}
      back={back}
      backLabel={t.nav.budgets}
    >
      <BudgetForm
        draft={{
          categoryKey: null,
          period: 'MONTHLY',
          limit: '',
          currency: options.defaultCurrency,
          alertThresholdPercent: 80,
          startsOn: options.defaultStartsOn,
          endsOn: null,
        }}
        options={options}
        back={back}
        locale={locale}
      />
    </EditorFrame>
  );
}

export function GoalEditor({
  data,
  back,
  locale,
  t,
}: {
  readonly data: GoalEditView;
  readonly back: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  const { options, ...draft } = data;
  return (
    <EditorFrame
      title={t.editing.goal.editTitle}
      intro={data.name}
      back={back}
      backLabel={t.nav.goals}
      aside={
        <ConfirmDelete
          action={deleteGoal}
          fields={{ key: data.key, back }}
          name={data.name}
          locale={locale}
        />
      }
    >
      <GoalForm draft={draft} options={options} back={back} locale={locale} />
    </EditorFrame>
  );
}

export function NewGoal({
  options,
  back,
  locale,
  t,
}: {
  readonly options: GoalOptions;
  readonly back: string;
  readonly locale: Locale;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <EditorFrame
      title={t.editing.goal.newTitle}
      intro={t.editing.goal.intro}
      back={back}
      backLabel={t.nav.goals}
    >
      <GoalForm
        draft={{
          name: '',
          type: 'SAVINGS',
          target: '',
          saved: '',
          currency: options.defaultCurrency,
          targetDate: null,
        }}
        options={options}
        back={back}
        locale={locale}
      />
    </EditorFrame>
  );
}
