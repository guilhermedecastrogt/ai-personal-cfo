'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { FieldErrorCode } from '@/lib/contracts';
import type { FormState } from '@/lib/form-state';
import type { Dictionary } from '@/lib/i18n/dictionary';

export const CONTROL_CLASS =
  'h-12 w-full rounded-xl border bg-surface px-4 text-base outline-none focus:border-brass disabled:opacity-60';

export function controlClass(error: FieldErrorCode | undefined): string {
  return `${CONTROL_CLASS} ${error === undefined ? 'border-line' : 'border-concern'}`;
}

export function Field({
  name,
  label,
  hint,
  optional = false,
  error,
  t,
  wide = false,
  children,
}: {
  readonly name: string;
  readonly label: string;
  readonly hint?: string;
  readonly optional?: boolean;
  readonly error: FieldErrorCode | undefined;
  readonly t: Dictionary;
  readonly wide?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <div className={`min-w-0 space-y-2 ${wide ? 'sm:col-span-2' : ''}`}>
      <label htmlFor={name} className="eyebrow flex items-baseline gap-2 text-muted">
        {label}
        {optional ? (
          <span className="text-[0.6875rem] normal-case tracking-normal text-muted/80">
            ({t.editing.optional})
          </span>
        ) : null}
      </label>
      {children}
      {error === undefined ? (
        hint === undefined ? null : (
          <p id={`${name}-hint`} className="text-sm text-muted">
            {hint}
          </p>
        )
      ) : (
        <p id={`${name}-error`} className="text-sm text-concern">
          {t.editing.fieldErrors[error]}
        </p>
      )}
    </div>
  );
}

export function describedBy(
  name: string,
  error: FieldErrorCode | undefined,
  hint?: string,
): string | undefined {
  if (error !== undefined) {
    return `${name}-error`;
  }
  return hint === undefined ? undefined : `${name}-hint`;
}

export function valueOf(state: FormState, field: string, initial: string): string {
  return state.values[field] ?? initial;
}

export function Problem({
  state,
  t,
}: {
  readonly state: FormState;
  readonly t: Dictionary;
}): ReactNode {
  if (state.problem === null) {
    return null;
  }
  const message = {
    INVALID: t.editing.fixFields,
    STALE: t.editing.stale,
    MISSING: t.editing.missing,
    TOO_MANY: t.editing.tooMany,
    UNAVAILABLE: t.editing.unavailable,
  }[state.problem];
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-concern/40 bg-concern-soft px-4 py-3 text-sm text-concern"
    >
      <span>{message}</span>
      {state.problem === 'STALE' ? (
        <button
          type="button"
          onClick={() => {
            window.location.reload();
          }}
          className="font-medium underline underline-offset-4"
        >
          {t.editing.reload}
        </button>
      ) : null}
    </div>
  );
}

export function Actions({
  pending,
  label,
  cancelHref,
  t,
}: {
  readonly pending: boolean;
  readonly label: string;
  readonly cancelHref: string;
  readonly t: Dictionary;
}): ReactNode {
  return (
    <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
      <Link
        href={cancelHref}
        className="grid h-12 place-items-center rounded-xl border border-line px-5 font-medium text-ink hover:bg-raised"
      >
        {t.editing.cancel}
      </Link>
      <button
        type="submit"
        disabled={pending}
        className="h-12 rounded-xl bg-accent px-6 font-medium text-accent-ink disabled:opacity-60"
      >
        {pending ? t.editing.saving : label}
      </button>
    </div>
  );
}
