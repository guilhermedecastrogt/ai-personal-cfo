'use client';

import { useRef, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { dictionaryFor, type Locale } from '@/lib/i18n/dictionary';
import type { Dictionary } from '@/lib/i18n/dictionary';
import { Icon } from '../icons';

function RemoveButton({ t }: { readonly t: Dictionary }): ReactNode {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="h-12 rounded-xl bg-concern px-5 font-medium text-surface disabled:opacity-60"
    >
      {pending ? t.editing.removing : t.editing.remove}
    </button>
  );
}

export function ConfirmDelete({
  action,
  fields,
  name,
  locale,
}: {
  readonly action: (form: FormData) => Promise<void>;
  readonly fields: Readonly<Record<string, string>>;
  readonly name: string;
  readonly locale: Locale;
}): ReactNode {
  const t = dictionaryFor(locale);
  const dialog = useRef<HTMLDialogElement>(null);
  const close = (): void => {
    dialog.current?.close();
  };
  return (
    <>
      <button
        type="button"
        onClick={() => {
          dialog.current?.showModal();
        }}
        aria-haspopup="dialog"
        className="inline-flex h-11 items-center gap-2 rounded-xl px-3 font-medium text-concern hover:bg-concern-soft"
      >
        <Icon name="trash" className="h-[18px] w-[18px]" />
        {t.editing.remove}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby="confirm-delete-title"
        aria-describedby="confirm-delete-body"
        onClick={(event) => {
          if (event.target === dialog.current) {
            close();
          }
        }}
        className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-panel"
      >
        <form action={action} className="space-y-4 p-6">
          {Object.entries(fields).map(([field, value]) => (
            <input key={field} type="hidden" name={field} value={value} />
          ))}
          <h2 id="confirm-delete-title" className="font-display text-xl leading-snug">
            {t.editing.removeTitle(name)}
          </h2>
          <p id="confirm-delete-body" className="text-sm text-muted">
            {t.editing.removeBody}
          </p>
          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              autoFocus
              className="h-12 rounded-xl border border-line px-5 font-medium hover:bg-raised"
            >
              {t.editing.keep}
            </button>
            <RemoveButton t={t} />
          </div>
        </form>
      </dialog>
    </>
  );
}
