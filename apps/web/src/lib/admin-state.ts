import type { InvitationView, RegistrationView } from './contracts';
import { INITIAL_FORM_STATE, failedState, type FormState } from './form-state';

export interface AdminState extends FormState {
  readonly done: number;
  readonly invitation: InvitationView | null;
  readonly welcome: RegistrationView['welcome'] | null;
}

export const INITIAL_ADMIN_STATE: AdminState = {
  ...INITIAL_FORM_STATE,
  done: 0,
  invitation: null,
  welcome: null,
};

export function succeeded(
  previous: AdminState,
  outcome: {
    readonly invitation?: InvitationView;
    readonly welcome?: RegistrationView['welcome'];
  } = {},
): AdminState {
  return {
    ...INITIAL_FORM_STATE,
    attempt: previous.attempt + 1,
    done: previous.done + 1,
    invitation: outcome.invitation ?? null,
    welcome: outcome.welcome ?? null,
  };
}

export function failed(
  failure: { readonly status: number; readonly body: unknown },
  values: Readonly<Record<string, string>>,
  previous: AdminState,
): AdminState {
  return {
    ...failedState(failure, values, previous),
    done: previous.done,
    invitation: null,
    welcome: null,
  };
}
