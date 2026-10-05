'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/api';
import { failedState, formText, formValues, returnPath, type FormState } from '@/lib/form-state';

const FIELDS = [
  'category',
  'period',
  'limit',
  'currency',
  'alertThresholdPercent',
  'startsOn',
  'endsOn',
] as const;
const LIST = '/budgets';
const HTTP_NOT_FOUND = 404;

function pathOf(form: FormData): string {
  return `/dashboard/budgets/${encodeURIComponent(formText(form, 'key'))}`;
}

export async function createBudget(previous: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, FIELDS);
  const outcome = await apiSend('POST', '/dashboard/budgets', values);
  if (!outcome.ok) {
    return failedState(outcome, values, previous);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}

export async function saveBudget(previous: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, FIELDS);
  const outcome = await apiSend('PATCH', pathOf(form), {
    version: formText(form, 'version'),
    ...values,
  });
  if (!outcome.ok) {
    return failedState(outcome, values, previous);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}

export async function deleteBudget(form: FormData): Promise<void> {
  const outcome = await apiSend('DELETE', pathOf(form));
  if (!outcome.ok && outcome.status !== HTTP_NOT_FOUND) {
    throw new ApiError(outcome.status);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}
