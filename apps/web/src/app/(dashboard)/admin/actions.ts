'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ApiError, apiSend } from '@/lib/api';
import { failed, succeeded, type AdminState } from '@/lib/admin-state';
import type { InvitationView, RegistrationView, WelcomeView } from '@/lib/contracts';
import { formText, formValues } from '@/lib/form-state';

const HOUSEHOLD_FIELDS = [
  'name',
  'firstMember',
  'phoneNumber',
  'currency',
  'timezone',
  'locale',
] as const;
const SETTINGS_FIELDS = ['name', 'timezone', 'locale'] as const;
const HTTP_NOT_FOUND = 404;
const UNEXPECTED = { status: 500, body: undefined };

function householdPath(form: FormData): string {
  return `/platform/households/${encodeURIComponent(formText(form, 'household'))}`;
}

function memberPath(form: FormData): string {
  return `${householdPath(form)}/members/${encodeURIComponent(formText(form, 'member'))}`;
}

function refresh(): void {
  revalidatePath('/admin', 'layout');
}

export async function createHousehold(previous: AdminState, form: FormData): Promise<AdminState> {
  const values = formValues(form, HOUSEHOLD_FIELDS);
  const outcome = await apiSend<RegistrationView>('POST', '/platform/households', values);
  if (!outcome.ok || outcome.data === undefined) {
    return failed(outcome.ok ? UNEXPECTED : outcome, values, previous);
  }
  refresh();
  const welcome = new URLSearchParams({ welcome: outcome.data.welcome });
  redirect(`/admin/${encodeURIComponent(outcome.data.key)}?${welcome.toString()}`);
}

export async function saveHousehold(previous: AdminState, form: FormData): Promise<AdminState> {
  const values = formValues(form, SETTINGS_FIELDS);
  const outcome = await apiSend('PATCH', householdPath(form), values);
  if (!outcome.ok) {
    return failed(outcome, values, previous);
  }
  refresh();
  revalidatePath('/', 'layout');
  return succeeded(previous);
}

export async function addMember(previous: AdminState, form: FormData): Promise<AdminState> {
  const values = formValues(form, ['name', 'phoneNumber']);
  const outcome = await apiSend<RegistrationView>('POST', `${householdPath(form)}/members`, values);
  if (!outcome.ok) {
    return failed(outcome, values, previous);
  }
  refresh();
  return succeeded(previous, { welcome: outcome.data?.welcome ?? 'NOT_REQUESTED' });
}

export async function registerEmail(previous: AdminState, form: FormData): Promise<AdminState> {
  const values = formValues(form, ['email']);
  const outcome = await apiSend('PATCH', `${memberPath(form)}/email`, values);
  if (!outcome.ok) {
    return failed(outcome, values, previous);
  }
  refresh();
  return succeeded(previous);
}

export async function addWhatsApp(previous: AdminState, form: FormData): Promise<AdminState> {
  const values = formValues(form, ['phoneNumber']);
  const outcome = await apiSend<RegistrationView>('POST', `${memberPath(form)}/whatsapp`, values);
  if (!outcome.ok) {
    return failed(outcome, values, previous);
  }
  refresh();
  return succeeded(previous, { welcome: outcome.data?.welcome ?? 'NOT_REQUESTED' });
}

export async function sendWelcome(previous: AdminState, form: FormData): Promise<AdminState> {
  const outcome = await apiSend<WelcomeView>('POST', `${memberPath(form)}/welcome`);
  if (!outcome.ok || outcome.data === undefined) {
    return failed(outcome.ok ? UNEXPECTED : outcome, {}, previous);
  }
  refresh();
  return succeeded(previous, { welcome: outcome.data.welcome });
}

export async function issueInvitation(previous: AdminState, form: FormData): Promise<AdminState> {
  const outcome = await apiSend<InvitationView>('POST', `${memberPath(form)}/invitation`);
  if (!outcome.ok || outcome.data === undefined) {
    return failed(outcome.ok ? UNEXPECTED : outcome, {}, previous);
  }
  refresh();
  return succeeded(previous, { invitation: outcome.data });
}

export async function changeAdmin(previous: AdminState, form: FormData): Promise<AdminState> {
  const grant = formText(form, 'grant') === 'true';
  const outcome = await apiSend(grant ? 'POST' : 'DELETE', `${memberPath(form)}/admin`);
  if (!outcome.ok) {
    return failed(outcome, {}, previous);
  }
  refresh();
  revalidatePath('/', 'layout');
  return succeeded(previous);
}

export async function revokeAccess(form: FormData): Promise<void> {
  const outcome = await apiSend('DELETE', `${memberPath(form)}/access`);
  if (!outcome.ok && outcome.status !== HTTP_NOT_FOUND) {
    throw new ApiError(outcome.status);
  }
  refresh();
}

export async function removeWhatsApp(form: FormData): Promise<void> {
  const outcome = await apiSend(
    'DELETE',
    `${householdPath(form)}/whatsapp/${encodeURIComponent(formText(form, 'identity'))}`,
  );
  if (!outcome.ok && outcome.status !== HTTP_NOT_FOUND) {
    throw new ApiError(outcome.status);
  }
  refresh();
}
