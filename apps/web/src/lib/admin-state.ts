import type { InvitationView } from './contracts';
import { INITIAL_FORM_STATE, failedState, type FormState } from './form-state';

export interface AdminState extends FormState {
  readonly done: number;
  readonly invitation: InvitationView | null;
}

export const INITIAL_ADMIN_STATE: AdminState = { ...INITIAL_FORM_STATE, done: 0, invitation: null };

export function succeeded(
  previous: AdminState,
  invitation: InvitationView | null = null,
): AdminState {
  return {
    ...INITIAL_FORM_STATE,
    attempt: previous.attempt + 1,
    done: previous.done + 1,
    invitation,
  };
}

export function failed(
  failure: { readonly status: number; readonly body: unknown },
  values: Readonly<Record<string, string>>,
  previous: AdminState,
): AdminState {
  return { ...failedState(failure, values, previous), done: previous.done, invitation: null };
}
