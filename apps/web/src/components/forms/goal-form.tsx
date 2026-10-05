'use client';

import { useActionState, type ReactNode } from 'react';
import { createGoal, saveGoal } from '@/app/(dashboard)/goals/actions';
import type { GoalEditView, GoalOptions } from '@/lib/contracts';
import { INITIAL_FORM_STATE } from '@/lib/form-state';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import { Actions, Field, Problem, controlClass, describedBy, valueOf } from './fields';

export type GoalDraft = Omit<GoalEditView, 'key' | 'version' | 'options'> &
  Partial<Pick<GoalEditView, 'key' | 'version'>>;

export function GoalForm({
  draft,
  options,
  back,
  locale,
}: {
  readonly draft: GoalDraft;
  readonly options: GoalOptions;
  readonly back: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const isNew = draft.key === undefined;
  const [state, action, pending] = useActionState(
    isNew ? createGoal : saveGoal,
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
        <Field name="name" label={t.editing.goal.name} error={error('name')} t={t} wide>
          <input
            id="name"
            name="name"
            defaultValue={value('name', draft.name)}
            maxLength={120}
            autoComplete="off"
            required
            aria-invalid={error('name') !== undefined}
            aria-describedby={describedBy('name', error('name'))}
            className={controlClass(error('name'))}
          />
        </Field>
        <Field name="type" label={t.editing.goal.type} error={error('type')} t={t}>
          <select
            id="type"
            name="type"
            defaultValue={value('type', draft.type)}
            aria-invalid={error('type') !== undefined}
            className={controlClass(error('type'))}
          >
            {options.types.map((type) => (
              <option key={type} value={type}>
                {t.editing.goal.types[type]}
              </option>
            ))}
          </select>
        </Field>
        <Field name="currency" label={t.editing.goal.currency} error={error('currency')} t={t}>
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
        <Field name="target" label={t.editing.goal.target} error={error('target')} t={t}>
          <input
            id="target"
            name="target"
            defaultValue={value('target', draft.target)}
            inputMode="decimal"
            autoComplete="off"
            required
            aria-invalid={error('target') !== undefined}
            aria-describedby={describedBy('target', error('target'))}
            className={`figure ${controlClass(error('target'))}`}
          />
        </Field>
        <Field name="saved" label={t.editing.goal.saved} optional error={error('saved')} t={t}>
          <input
            id="saved"
            name="saved"
            defaultValue={value('saved', draft.saved)}
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={error('saved') !== undefined}
            aria-describedby={describedBy('saved', error('saved'))}
            className={`figure ${controlClass(error('saved'))}`}
          />
        </Field>
        <Field
          name="targetDate"
          label={t.editing.goal.targetDate}
          optional
          error={error('targetDate')}
          t={t}
        >
          <input
            id="targetDate"
            name="targetDate"
            type="date"
            defaultValue={value('targetDate', draft.targetDate)}
            aria-invalid={error('targetDate') !== undefined}
            aria-describedby={describedBy('targetDate', error('targetDate'))}
            className={controlClass(error('targetDate'))}
          />
        </Field>
      </div>
      <Actions
        pending={pending}
        label={isNew ? t.editing.goal.create : t.editing.save}
        cancelHref={back}
        t={t}
      />
    </form>
  );
}
