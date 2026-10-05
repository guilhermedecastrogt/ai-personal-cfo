'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/api';
import { failedState, formText, formValues, returnPath, type FormState } from '@/lib/form-state';

const FIELDS = ['name', 'type', 'target', 'saved', 'currency', 'targetDate'] as const;
const LIST = '/goals';
const HTTP_NOT_FOUND = 404;

function pathOf(form: FormData): string {
  return `/dashboard/goals/${encodeURIComponent(formText(form, 'key'))}`;
}

export async function createGoal(previous: FormState, form: FormData): Promise<FormState> {
  const values = formValues(form, FIELDS);
  const outcome = await apiSend('POST', '/dashboard/goals', values);
  if (!outcome.ok) {
    return failedState(outcome, values, previous);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}

export async function saveGoal(previous: FormState, form: FormData): Promise<FormState> {
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

export async function deleteGoal(form: FormData): Promise<void> {
  const outcome = await apiSend('DELETE', pathOf(form));
  if (!outcome.ok && outcome.status !== HTTP_NOT_FOUND) {
    throw new ApiError(outcome.status);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}
