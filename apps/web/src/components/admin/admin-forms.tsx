'use client';

import { useActionState, useId, useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import {
  addMember,
  addWhatsApp,
  changeAdmin,
  createHousehold,
  issueInvitation,
  registerEmail,
  removeWhatsApp,
  revokeAccess,
  saveHousehold,
  sendWelcome,
} from '@/app/(dashboard)/admin/actions';
import { INITIAL_ADMIN_STATE, type AdminState } from '@/lib/admin-state';
import type { FieldErrorCode } from '@/lib/contracts';
import { dictionaryFor, type Dictionary, type Locale } from '@/lib/i18n/dictionary';
import { Icon } from '../icons';

const TIMEZONES = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Recife',
  'America/New_York',
  'Europe/Lisbon',
  'Europe/Dublin',
  'Europe/London',
  'Europe/Madrid',
];

const INPUT =
  'h-11 w-full min-w-0 rounded-xl border bg-surface px-3.5 text-[0.9375rem] outline-none focus:border-brass';
const SMALL_INPUT =
  'h-10 w-full min-w-0 rounded-xl border bg-surface px-3 text-sm outline-none focus:border-brass';
const PRIMARY =
  'h-11 shrink-0 rounded-xl bg-accent px-5 font-medium text-accent-ink disabled:opacity-60';
const SECONDARY =
  'h-10 shrink-0 rounded-xl border border-line px-3.5 text-sm font-medium hover:bg-raised disabled:opacity-60';

type ErrorTable = Readonly<Record<string, Readonly<Partial<Record<FieldErrorCode, string>>>>>;

function messageOf(t: Dictionary, field: string, code: FieldErrorCode): string {
  const specific = (t.admin.errors as ErrorTable)[field]?.[code];
  return specific ?? t.editing.fieldErrors[code];
}

function border(state: AdminState, field: string): string {
  return state.errors[field] === undefined ? 'border-line' : 'border-concern';
}

function FieldMessage({
  state,
  field,
  t,
}: {
  readonly state: AdminState;
  readonly field: string;
  readonly t: Dictionary;
}): ReactNode {
  const code = state.errors[field];
  return code === undefined ? null : (
    <p id={`${field}-error`} className="mt-1.5 text-sm text-concern">
      {messageOf(t, field, code)}
    </p>
  );
}

function Problem({ state, t }: { readonly state: AdminState; readonly t: Dictionary }): ReactNode {
  const code = state.errors.form;
  if (state.problem === null || (state.problem === 'INVALID' && code === undefined)) {
    return null;
  }
  const message =
    state.problem === 'INVALID' && code !== undefined
      ? messageOf(t, 'form', code)
      : {
          INVALID: t.editing.fixFields,
          STALE: t.editing.stale,
          MISSING: t.editing.missing,
          TOO_MANY: t.editing.tooMany,
          UNAVAILABLE: t.editing.unavailable,
        }[state.problem];
  return (
    <p role="alert" className="text-sm text-concern">
      {message}
    </p>
  );
}

function WelcomeResult({
  state,
  t,
}: {
  readonly state: AdminState;
  readonly t: Dictionary;
}): ReactNode {
  if (state.welcome === null || state.problem !== null) {
    return null;
  }
  const ok = state.welcome === 'SENT' || state.welcome === 'NOT_REQUESTED';
  return (
    <p role="status" className={`text-sm ${ok ? 'text-kept' : 'text-caution'}`}>
      {t.admin.welcomeResult[state.welcome]}
    </p>
  );
}

function PhoneInput({
  id,
  state,
  welcomeEnabled,
  t,
}: {
  readonly id: string;
  readonly state: AdminState;
  readonly welcomeEnabled: boolean;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <Label htmlFor={id}>{t.admin.whatsappOptional}</Label>
      <input
        id={id}
        name="phoneNumber"
        type="tel"
        defaultValue={state.values.phoneNumber ?? ''}
        placeholder="+5511999990000"
        aria-invalid={state.errors.phoneNumber !== undefined}
        aria-describedby={
          state.errors.phoneNumber === undefined ? `${id}-hint` : 'phoneNumber-error'
        }
        className={`${INPUT} ${border(state, 'phoneNumber')}`}
      />
      {state.errors.phoneNumber === undefined ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {welcomeEnabled ? t.admin.welcomeHint : t.admin.welcomeOff}
        </p>
      ) : (
        <FieldMessage state={state} field="phoneNumber" t={t} />
      )}
    </>
  );
}

function Hidden({ fields }: { readonly fields: Readonly<Record<string, string>> }): ReactNode {
  return Object.entries(fields).map(([name, value]) => (
    <input key={name} type="hidden" name={name} value={value} />
  ));
}

function Label({
  htmlFor,
  children,
}: {
  readonly htmlFor: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <label htmlFor={htmlFor} className="eyebrow mb-1.5 block text-muted">
      {children}
    </label>
  );
}

function LocaleSelect({
  id,
  value,
  locales,
  t,
}: {
  readonly id: string;
  readonly value: string;
  readonly locales: readonly Locale[];
  readonly t: Dictionary;
}): ReactNode {
  return (
    <select id={id} name="locale" defaultValue={value} className={`${INPUT} border-line`}>
      {locales.map((option) => (
        <option key={option} value={option}>
          {t.admin.locales[option]}
        </option>
      ))}
    </select>
  );
}

function TimezoneInput({
  id,
  value,
  state,
  t,
}: {
  readonly id: string;
  readonly value: string;
  readonly state: AdminState;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <>
      <input
        id={id}
        name="timezone"
        list={`${id}-zones`}
        defaultValue={state.values.timezone ?? value}
        autoComplete="off"
        aria-invalid={state.errors.timezone !== undefined}
        aria-describedby={state.errors.timezone === undefined ? `${id}-hint` : 'timezone-error'}
        className={`${INPUT} ${border(state, 'timezone')}`}
      />
      <datalist id={`${id}-zones`}>
        {TIMEZONES.map((zone) => (
          <option key={zone} value={zone} />
        ))}
      </datalist>
      {state.errors.timezone === undefined ? (
        <p id={`${id}-hint`} className="mt-1.5 text-sm text-muted">
          {t.admin.timezoneHint}
        </p>
      ) : (
        <FieldMessage state={state} field="timezone" t={t} />
      )}
    </>
  );
}

export function NewHouseholdForm({
  currencies,
  locales,
  defaultTimezone,
  welcomeEnabled,
  locale,
}: {
  readonly currencies: readonly string[];
  readonly locales: readonly Locale[];
  readonly defaultTimezone: string;
  readonly welcomeEnabled: boolean;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(createHousehold, INITIAL_ADMIN_STATE);
  return (
    <form action={action} key={state.attempt} className="space-y-5" noValidate>
      <Problem state={state} t={t} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="new-name">{t.admin.name}</Label>
          <input
            id="new-name"
            name="name"
            defaultValue={state.values.name ?? ''}
            maxLength={120}
            aria-invalid={state.errors.name !== undefined}
            className={`${INPUT} ${border(state, 'name')}`}
          />
          <FieldMessage state={state} field="name" t={t} />
        </div>
        <div>
          <Label htmlFor="new-first-member">{t.admin.firstMember}</Label>
          <input
            id="new-first-member"
            name="firstMember"
            defaultValue={state.values.firstMember ?? ''}
            maxLength={120}
            aria-invalid={state.errors.firstMember !== undefined}
            className={`${INPUT} ${border(state, 'firstMember')}`}
          />
          <FieldMessage state={state} field="firstMember" t={t} />
        </div>
        <div className="sm:col-span-2">
          <PhoneInput id="new-phone" state={state} welcomeEnabled={welcomeEnabled} t={t} />
        </div>
        <div>
          <Label htmlFor="new-currency">{t.admin.currency}</Label>
          <select
            id="new-currency"
            name="currency"
            defaultValue={state.values.currency ?? currencies[0]}
            className={`${INPUT} ${border(state, 'currency')}`}
          >
            {currencies.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>
          <FieldMessage state={state} field="currency" t={t} />
        </div>
        <div>
          <Label htmlFor="new-locale">{t.admin.locale}</Label>
          <LocaleSelect
            id="new-locale"
            value={state.values.locale ?? locale}
            locales={locales}
            t={t}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="new-timezone">{t.admin.timezone}</Label>
          <TimezoneInput id="new-timezone" value={defaultTimezone} state={state} t={t} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">{t.admin.newHouseholdNote}</p>
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.admin.creating : t.admin.create}
        </button>
      </div>
    </form>
  );
}

export function HouseholdSettingsForm({
  household,
  name,
  timezone,
  current,
  locales,
  locale,
}: {
  readonly household: string;
  readonly name: string;
  readonly timezone: string;
  readonly current: Locale;
  readonly locales: readonly Locale[];
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(saveHousehold, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-5" noValidate>
      <Hidden fields={{ household }} />
      <Problem state={state} t={t} />
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="settings-name">{t.admin.name}</Label>
          <input
            id="settings-name"
            name="name"
            defaultValue={state.values.name ?? name}
            maxLength={120}
            aria-invalid={state.errors.name !== undefined}
            className={`${INPUT} ${border(state, 'name')}`}
          />
          <FieldMessage state={state} field="name" t={t} />
        </div>
        <div>
          <Label htmlFor="settings-locale">{t.admin.locale}</Label>
          <LocaleSelect
            id="settings-locale"
            value={state.values.locale ?? current}
            locales={locales}
            t={t}
          />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="settings-timezone">{t.admin.timezone}</Label>
          <TimezoneInput id="settings-timezone" value={timezone} state={state} t={t} />
        </div>
      </div>
      <div className="flex items-center justify-end gap-3">
        {state.done > 0 && state.problem === null ? (
          <p role="status" className="text-sm text-kept">
            {t.admin.saved}
          </p>
        ) : null}
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.admin.saving : t.admin.save}
        </button>
      </div>
    </form>
  );
}

export function AddMemberForm({
  household,
  welcomeEnabled,
  locale,
}: {
  readonly household: string;
  readonly welcomeEnabled: boolean;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(addMember, INITIAL_ADMIN_STATE);
  return (
    <form action={action} key={state.attempt} className="space-y-4" noValidate>
      <Hidden fields={{ household }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="member-name">{t.admin.memberName}</Label>
          <input
            id="member-name"
            name="name"
            defaultValue={state.values.name ?? ''}
            maxLength={120}
            aria-invalid={state.errors.name !== undefined}
            className={`${INPUT} ${border(state, 'name')}`}
          />
          <FieldMessage state={state} field="name" t={t} />
        </div>
        <div>
          <PhoneInput id="member-phone" state={state} welcomeEnabled={welcomeEnabled} t={t} />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Problem state={state} t={t} />
        <WelcomeResult state={state} t={t} />
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? t.admin.adding : t.admin.addMember}
        </button>
      </div>
    </form>
  );
}

function InlineField({
  household,
  member,
  field,
  type,
  label,
  hint,
  initial,
  submit,
  action,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly field: string;
  readonly type: string;
  readonly label: string;
  readonly hint: string;
  readonly initial: string;
  readonly submit: string;
  readonly action: (previous: AdminState, form: FormData) => Promise<AdminState>;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const id = useId();
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_STATE);
  const describedBy = state.errors[field] === undefined ? `${id}-hint` : `${field}-error`;
  return (
    <form action={formAction} key={state.attempt} noValidate>
      <Hidden fields={{ household, member }} />
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          name={field}
          type={type}
          defaultValue={state.values[field] ?? initial}
          aria-invalid={state.errors[field] !== undefined}
          aria-describedby={describedBy}
          placeholder={label}
          className={`${SMALL_INPUT} ${border(state, field)}`}
        />
        <button type="submit" disabled={pending} className={SECONDARY}>
          {submit}
        </button>
      </div>
      {state.errors[field] === undefined ? (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : (
        <FieldMessage state={state} field={field} t={t} />
      )}
      {state.problem !== null && state.problem !== 'INVALID' ? (
        <Problem state={state} t={t} />
      ) : null}
      <WelcomeResult state={state} t={t} />
    </form>
  );
}

export function EmailForm({
  household,
  member,
  email,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly email: string | null;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  return (
    <InlineField
      household={household}
      member={member}
      field="email"
      type="email"
      label={t.admin.email}
      hint={t.admin.emailHint}
      initial={email ?? ''}
      submit={t.admin.saveEmail}
      action={registerEmail}
      locale={locale}
    />
  );
}

export function WhatsAppForm({
  household,
  member,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  return (
    <InlineField
      household={household}
      member={member}
      field="phoneNumber"
      type="tel"
      label={t.admin.phoneNumber}
      hint={t.admin.phoneHint}
      initial=""
      submit={t.admin.addNumber}
      action={addWhatsApp}
      locale={locale}
    />
  );
}

function SubmitIcon({ label }: { readonly label: string }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-concern-soft hover:text-concern disabled:opacity-50"
    >
      <Icon name="close" className="h-3.5 w-3.5" />
    </button>
  );
}

export function RemoveWhatsAppButton({
  household,
  identity,
  phoneNumber,
  locale,
}: {
  readonly household: string;
  readonly identity: string;
  readonly phoneNumber: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  return (
    <form action={removeWhatsApp}>
      <Hidden fields={{ household, identity }} />
      <SubmitIcon label={t.admin.removeNumber(phoneNumber)} />
    </form>
  );
}

export function InvitationForm({
  household,
  member,
  name,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly name: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(issueInvitation, INITIAL_ADMIN_STATE);
  const { invitation } = state;
  return (
    <div className="space-y-3">
      <form action={action}>
        <Hidden fields={{ household, member }} />
        <button type="submit" disabled={pending} className={SECONDARY}>
          {pending ? t.admin.inviting : t.admin.invite}
        </button>
      </form>
      <Problem state={state} t={t} />
      {invitation === null ? null : (
        <div
          role="status"
          className="rounded-xl border border-brass/40 bg-caution-soft/60 p-4 text-sm"
        >
          <p className="font-medium">{t.admin.invitationTitle(name)}</p>
          <p className="mt-2 select-all break-all rounded-lg bg-surface px-3 py-2 font-mono text-[0.9375rem] tracking-wide text-ink">
            {invitation.code}
          </p>
          <p className="mt-2 text-muted">{t.admin.invitationBody}</p>
          <p className="mt-1 text-muted">
            {invitation.email === null
              ? t.admin.invitationNoEmail
              : t.admin.invitationEmail(invitation.email)}
          </p>
        </div>
      )}
    </div>
  );
}

export function WelcomeButton({
  household,
  member,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(sendWelcome, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-2">
      <Hidden fields={{ household, member }} />
      <button type="submit" disabled={pending} className={SECONDARY}>
        {pending ? t.admin.sendingWelcome : t.admin.sendWelcome}
      </button>
      <Problem state={state} t={t} />
      <WelcomeResult state={state} t={t} />
    </form>
  );
}

export function AdminToggle({
  household,
  member,
  isAdmin,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly isAdmin: boolean;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const [state, action, pending] = useActionState(changeAdmin, INITIAL_ADMIN_STATE);
  return (
    <form action={action} className="space-y-2">
      <Hidden fields={{ household, member, grant: String(!isAdmin) }} />
      <button type="submit" disabled={pending} className={SECONDARY}>
        {isAdmin ? t.admin.revokeAdmin : t.admin.grantAdmin}
      </button>
      <Problem state={state} t={t} />
    </form>
  );
}

function ConfirmButton({ t }: { readonly t: Dictionary }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-11 rounded-xl bg-concern px-5 font-medium text-surface disabled:opacity-60"
    >
      {pending ? t.admin.revoking : t.admin.revokeConfirm}
    </button>
  );
}

export function RevokeAccessButton({
  household,
  member,
  name,
  locale,
}: {
  readonly household: string;
  readonly member: string;
  readonly name: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const id = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const close = (): void => {
    dialog.current?.close();
  };
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => {
          dialog.current?.showModal();
        }}
        className="h-10 rounded-xl px-3.5 text-sm font-medium text-concern hover:bg-concern-soft"
      >
        {t.admin.revoke}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={`${id}-body`}
        onClick={(event) => {
          if (event.target === dialog.current) {
            close();
          }
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-panel"
      >
        <form
          action={async (form) => {
            await revokeAccess(form);
            close();
          }}
          className="space-y-4 p-6"
        >
          <Hidden fields={{ household, member }} />
          <h2 id={`${id}-title`} className="font-display text-xl leading-snug">
            {t.admin.revokeTitle(name)}
          </h2>
          <p id={`${id}-body`} className="text-sm text-muted">
            {t.admin.revokeBody}
          </p>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              autoFocus
              className="h-11 rounded-xl border border-line px-5 font-medium hover:bg-raised"
            >
              {t.admin.keep}
            </button>
            <ConfirmButton t={t} />
          </div>
        </form>
      </dialog>
    </>
  );
}
