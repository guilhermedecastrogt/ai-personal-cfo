import type { FieldError, FieldErrorCode } from './contracts';

export type FormProblem = 'INVALID' | 'STALE' | 'MISSING' | 'TOO_MANY' | 'UNAVAILABLE';

export interface FormState {
  readonly problem: FormProblem | null;
  readonly errors: Readonly<Partial<Record<string, FieldErrorCode>>>;
  readonly values: Readonly<Record<string, string>>;
  readonly attempt: number;
}

export const INITIAL_FORM_STATE: FormState = { problem: null, errors: {}, values: {}, attempt: 0 };

const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_UNPROCESSABLE = 422;
const HTTP_TOO_MANY_REQUESTS = 429;

export function formValues(form: FormData, fields: readonly string[]): Record<string, string> {
  return Object.fromEntries(
    fields.map((field) => {
      const value = form.get(field);
      return [field, typeof value === 'string' ? value : ''];
    }),
  );
}

export function formText(form: FormData, field: string): string {
  const value = form.get(field);
  return typeof value === 'string' ? value : '';
}

export function returnPath(
  value: FormDataEntryValue | string | null | undefined,
  fallback: string,
): string {
  if (typeof value !== 'string' || !value.startsWith('/') || /^\/[/\\]/.test(value)) {
    return fallback;
  }
  return value;
}

function fieldErrorsOf(body: unknown): Partial<Record<string, FieldErrorCode>> {
  const errors = (body as { errors?: unknown } | undefined)?.errors;
  if (!Array.isArray(errors)) {
    return { form: 'INVALID' };
  }
  return Object.fromEntries((errors as FieldError[]).map((error) => [error.field, error.code]));
}

export function failedState(
  failure: { readonly status: number; readonly body: unknown },
  values: Readonly<Record<string, string>>,
  previous: FormState,
): FormState {
  const attempt = previous.attempt + 1;
  switch (failure.status) {
    case HTTP_UNPROCESSABLE:
      return { problem: 'INVALID', errors: fieldErrorsOf(failure.body), values, attempt };
    case HTTP_CONFLICT:
      return { problem: 'STALE', errors: {}, values, attempt };
    case HTTP_NOT_FOUND:
      return { problem: 'MISSING', errors: {}, values, attempt };
    case HTTP_TOO_MANY_REQUESTS:
      return { problem: 'TOO_MANY', errors: {}, values, attempt };
    default:
      return { problem: 'UNAVAILABLE', errors: {}, values, attempt };
  }
}
