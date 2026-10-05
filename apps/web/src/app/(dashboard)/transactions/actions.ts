'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/api';
import { failedState, formText, formValues, returnPath, type FormState } from '@/lib/form-state';

const FIELDS = [
  'type',
  'amount',
  'date',
  'merchant',
  'description',
  'category',
  'member',
  'account',
  'expenseScope',
] as const;
const LIST = '/transactions';
const HTTP_NOT_FOUND = 404;

function pathOf(form: FormData): string {
  return `/dashboard/transactions/${encodeURIComponent(formText(form, 'key'))}`;
}

export async function saveTransaction(previous: FormState, form: FormData): Promise<FormState> {
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

export async function deleteTransaction(form: FormData): Promise<void> {
  const outcome = await apiSend('DELETE', pathOf(form));
  if (!outcome.ok && outcome.status !== HTTP_NOT_FOUND) {
    throw new ApiError(outcome.status);
  }
  revalidatePath('/', 'layout');
  redirect(returnPath(form.get('back'), LIST));
}
