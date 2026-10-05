'use client';

import { useActionState, useState, type ReactNode } from 'react';
import { saveTransaction } from '@/app/(dashboard)/transactions/actions';
import type { TransactionEditView } from '@/lib/contracts';
import { INITIAL_FORM_STATE } from '@/lib/form-state';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import { Actions, Field, Problem, controlClass, describedBy, valueOf } from './fields';

export function TransactionForm({
  data,
  back,
  locale,
}: {
  readonly data: TransactionEditView;
  readonly back: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(saveTransaction, INITIAL_FORM_STATE);
  const [type, setType] = useState(valueOf(state, 'type', data.type));
  const [accountKey, setAccountKey] = useState(valueOf(state, 'account', data.accountKey));
  const isTransfer = data.type === 'TRANSFER';
  const currency =
    data.options.accounts.find((account) => account.key === accountKey)?.currency ?? data.currency;
  const categories = data.options.categories.filter((category) => category.kind === type);
  const value = (field: string, initial: string | null): string =>
    valueOf(state, field, initial ?? '');
  const error = (field: string): (typeof state.errors)[string] => state.errors[field];
  const amountHint = t.editing.transaction.amountHint(currency);
  return (
    <form action={action} key={state.attempt} className="space-y-6" noValidate>
      <input type="hidden" name="key" value={data.key} />
      <input type="hidden" name="version" value={data.version} />
      <input type="hidden" name="back" value={back} />
      <Problem state={state} t={t} />
      <div className="grid gap-5 sm:grid-cols-2">
        {isTransfer ? (
          <Field name="type" label={t.editing.transaction.type} error={error('type')} t={t}>
            <input type="hidden" name="type" value="TRANSFER" />
            <p id="type" className="flex h-12 items-center text-muted">
              {t.transactions.types.TRANSFER} · {t.editing.transaction.typeLocked}
            </p>
          </Field>
        ) : (
          <Field name="type" label={t.editing.transaction.type} error={error('type')} t={t}>
            <select
              id="type"
              name="type"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
              }}
              aria-invalid={error('type') !== undefined}
              aria-describedby={describedBy('type', error('type'))}
              className={controlClass(error('type'))}
            >
              <option value="EXPENSE">{t.transactions.types.EXPENSE}</option>
              <option value="INCOME">{t.transactions.types.INCOME}</option>
            </select>
          </Field>
        )}
        <Field
          name="amount"
          label={t.editing.transaction.amount}
          hint={amountHint}
          error={error('amount')}
          t={t}
        >
          <input
            id="amount"
            name="amount"
            defaultValue={value('amount', data.amount)}
            inputMode="decimal"
            autoComplete="off"
            required
            aria-invalid={error('amount') !== undefined}
            aria-describedby={describedBy('amount', error('amount'), amountHint)}
            className={`figure ${controlClass(error('amount'))}`}
          />
        </Field>
        <Field name="date" label={t.editing.transaction.date} error={error('date')} t={t}>
          <input
            id="date"
            name="date"
            type="date"
            defaultValue={value('date', data.date)}
            required
            aria-invalid={error('date') !== undefined}
            aria-describedby={describedBy('date', error('date'))}
            className={controlClass(error('date'))}
          />
        </Field>
        <Field name="account" label={t.editing.transaction.account} error={error('account')} t={t}>
          <select
            id="account"
            name="account"
            value={accountKey}
            onChange={(event) => {
              setAccountKey(event.target.value);
            }}
            aria-invalid={error('account') !== undefined}
            aria-describedby={describedBy('account', error('account'))}
            className={controlClass(error('account'))}
          >
            {data.options.accounts.map((account) => (
              <option key={account.key} value={account.key}>
                {account.name} · {account.currency}
              </option>
            ))}
          </select>
        </Field>
        {isTransfer && data.transferAccount !== null ? (
          <Field
            name="transferAccount"
            label={t.editing.transaction.transferTo}
            error={undefined}
            t={t}
          >
            <p id="transferAccount" className="flex h-12 items-center">
              {data.transferAccount}
            </p>
          </Field>
        ) : null}
        <Field
          name="merchant"
          label={t.editing.transaction.merchant}
          optional
          error={error('merchant')}
          t={t}
        >
          <input
            id="merchant"
            name="merchant"
            defaultValue={value('merchant', data.merchant)}
            maxLength={200}
            autoComplete="off"
            aria-invalid={error('merchant') !== undefined}
            aria-describedby={describedBy('merchant', error('merchant'))}
            className={controlClass(error('merchant'))}
          />
        </Field>
        {isTransfer ? (
          <input type="hidden" name="category" value="" />
        ) : (
          <Field
            name="category"
            label={t.editing.transaction.category}
            optional
            error={error('category')}
            t={t}
          >
            <select
              id="category"
              name="category"
              key={type}
              defaultValue={
                categories.some((category) => category.key === value('category', data.categoryKey))
                  ? value('category', data.categoryKey)
                  : ''
              }
              aria-invalid={error('category') !== undefined}
              aria-describedby={describedBy('category', error('category'))}
              className={controlClass(error('category'))}
            >
              <option value="">{t.editing.none}</option>
              {categories.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field name="member" label={t.editing.transaction.member} error={error('member')} t={t}>
          <select
            id="member"
            name="member"
            defaultValue={value('member', data.memberKey)}
            aria-invalid={error('member') !== undefined}
            aria-describedby={describedBy('member', error('member'))}
            className={controlClass(error('member'))}
          >
            {data.options.members.map((member) => (
              <option key={member.key} value={member.key}>
                {member.name}
              </option>
            ))}
          </select>
        </Field>
        {type === 'EXPENSE' ? (
          <Field
            name="expenseScope"
            label={t.editing.transaction.scope}
            error={error('expenseScope')}
            t={t}
          >
            <select
              id="expenseScope"
              name="expenseScope"
              defaultValue={value('expenseScope', data.expenseScope)}
              className={controlClass(error('expenseScope'))}
            >
              <option value="HOUSEHOLD">{t.editing.transaction.scopes.HOUSEHOLD}</option>
              <option value="INDIVIDUAL">{t.editing.transaction.scopes.INDIVIDUAL}</option>
            </select>
          </Field>
        ) : (
          <input type="hidden" name="expenseScope" value={data.expenseScope} />
        )}
        <Field
          name="description"
          label={t.editing.transaction.description}
          optional
          error={error('description')}
          t={t}
          wide
        >
          <textarea
            id="description"
            name="description"
            defaultValue={value('description', data.description)}
            maxLength={500}
            rows={2}
            aria-invalid={error('description') !== undefined}
            aria-describedby={describedBy('description', error('description'))}
            className={`${controlClass(error('description'))} h-auto py-3`}
          />
        </Field>
      </div>
      <Actions pending={pending} label={t.editing.save} cancelHref={back} t={t} />
    </form>
  );
}
