'use client';

import { useActionState, type ReactNode } from 'react';
import { createBudget, saveBudget } from '@/app/(dashboard)/budgets/actions';
import type { BudgetEditView, BudgetOptions } from '@/lib/contracts';
import { INITIAL_FORM_STATE } from '@/lib/form-state';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import { Actions, Field, Problem, controlClass, describedBy, valueOf } from './fields';

export type BudgetDraft = Omit<BudgetEditView, 'key' | 'version' | 'options'> &
  Partial<Pick<BudgetEditView, 'key' | 'version'>>;

export function BudgetForm({
  draft,
  options,
  back,
  locale,
}: {
  readonly draft: BudgetDraft;
  readonly options: BudgetOptions;
  readonly back: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const isNew = draft.key === undefined;
  const [state, action, pending] = useActionState(
    isNew ? createBudget : saveBudget,
    INITIAL_FORM_STATE,
  );
  const value = (field: string, initial: string | null): string =>
    valueOf(state, field, initial ?? '');
  const error = (field: string): (typeof state.errors)[string] => state.errors[field];
  return (
    <form action={action} key={state.attempt} className="space-y-6" noValidate>
      {isNew ? null : (
        <>
          <input type="hidden" name="key" value={draft.key} />
          <input type="hidden" name="version" value={draft.version} />
        </>
      )}
      <input type="hidden" name="back" value={back} />
      <Problem state={state} t={t} />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field name="category" label={t.editing.budget.category} error={error('category')} t={t}>
          <select
            id="category"
            name="category"
            defaultValue={value('category', draft.categoryKey)}
            aria-invalid={error('category') !== undefined}
            aria-describedby={describedBy('category', error('category'))}
            className={controlClass(error('category'))}
          >
            <option value="">{t.editing.budget.allSpending}</option>
            {options.categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.name}
              </option>
            ))}
          </select>
        </Field>
        <Field name="period" label={t.editing.budget.period} error={error('period')} t={t}>
          <select
            id="period"
            name="period"
            defaultValue={value('period', draft.period)}
            aria-invalid={error('period') !== undefined}
            className={controlClass(error('period'))}
          >
            {options.periods.map((period) => (
              <option key={period} value={period}>
                {t.editing.budget.periods[period]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="limit" label={t.editing.budget.limit} error={error('limit')} t={t}>
          <input
            id="limit"
            name="limit"
            defaultValue={value('limit', draft.limit)}
            inputMode="decimal"
            autoComplete="off"
            required
            aria-invalid={error('limit') !== undefined}
            aria-describedby={describedBy('limit', error('limit'))}
            className={`figure ${controlClass(error('limit'))}`}
          />
        </Field>
        <Field name="currency" label={t.editing.budget.currency} error={error('currency')} t={t}>
          <select
            id="currency"
            name="currency"
            defaultValue={value('currency', draft.currency)}
            aria-invalid={error('currency') !== undefined}
            aria-describedby={describedBy('currency', error('currency'))}
            className={controlClass(error('currency'))}
          >
            {options.currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
        </Field>
        <Field
          name="alertThresholdPercent"
          label={t.editing.budget.alert}
          hint={t.editing.budget.alertHint}
          error={error('alertThresholdPercent')}
          t={t}
        >
          <div className="relative">
            <input
              id="alertThresholdPercent"
              name="alertThresholdPercent"
              type="number"
              min={1}
              max={100}
              step={1}
              inputMode="numeric"
              defaultValue={value('alertThresholdPercent', String(draft.alertThresholdPercent))}
              aria-invalid={error('alertThresholdPercent') !== undefined}
              aria-describedby={describedBy(
                'alertThresholdPercent',
                error('alertThresholdPercent'),
                t.editing.budget.alertHint,
              )}
              className={`figure pr-10 ${controlClass(error('alertThresholdPercent'))}`}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-muted"
            >
              %
            </span>
          </div>
        </Field>
        <Field name="startsOn" label={t.editing.budget.startsOn} error={error('startsOn')} t={t}>
          <input
            id="startsOn"
            name="startsOn"
            type="date"
            defaultValue={value('startsOn', draft.startsOn)}
            required
            aria-invalid={error('startsOn') !== undefined}
            className={controlClass(error('startsOn'))}
          />
        </Field>
        <Field
          name="endsOn"
          label={t.editing.budget.endsOn}
          hint={t.editing.budget.endsOnHint}
          optional
          error={error('endsOn')}
          t={t}
        >
          <input
            id="endsOn"
            name="endsOn"
            type="date"
            defaultValue={value('endsOn', draft.endsOn)}
            aria-invalid={error('endsOn') !== undefined}
            aria-describedby={describedBy('endsOn', error('endsOn'), t.editing.budget.endsOnHint)}
            className={controlClass(error('endsOn'))}
          />
        </Field>
      </div>
      <Actions
        pending={pending}
        label={isNew ? t.editing.budget.create : t.editing.save}
        cancelHref={back}
        t={t}
      />
    </form>
  );
}
