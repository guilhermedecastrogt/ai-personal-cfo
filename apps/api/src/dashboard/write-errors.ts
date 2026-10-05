import type { BudgetRejectionReason } from '../budgets/budgets.service.js';
import type { GoalRejectionReason } from '../goals/goals.service.js';
import type { TransactionRejectionReason } from '../transactions/transactions.service.js';
import type { FieldError } from './dashboard.contracts.js';
import { uniqueByField } from './write-requests.js';

const TRANSACTION_FIELD_ERRORS: Readonly<Record<TransactionRejectionReason, FieldError>> = {
  INVALID_INPUT: { field: 'form', code: 'INVALID' },
  UNKNOWN_MEMBER: { field: 'member', code: 'UNKNOWN' },
  UNKNOWN_ACCOUNT: { field: 'account', code: 'UNKNOWN' },
  UNKNOWN_TRANSFER_ACCOUNT: { field: 'account', code: 'UNKNOWN' },
  UNKNOWN_CATEGORY: { field: 'category', code: 'UNKNOWN' },
  ACCOUNT_CURRENCY_MISMATCH: { field: 'account', code: 'CURRENCY_MISMATCH' },
  TRANSFER_WITHOUT_DESTINATION: { field: 'type', code: 'NOT_ALLOWED' },
  TRANSFER_TO_SAME_ACCOUNT: { field: 'account', code: 'NOT_ALLOWED' },
  TRANSFER_CURRENCY_MISMATCH: { field: 'account', code: 'CURRENCY_MISMATCH' },
  TRANSFER_WITH_CATEGORY: { field: 'category', code: 'NOT_ALLOWED' },
  DESTINATION_WITHOUT_TRANSFER: { field: 'type', code: 'NOT_ALLOWED' },
  CATEGORY_KIND_MISMATCH: { field: 'category', code: 'KIND_MISMATCH' },
  TYPE_CHANGE_NOT_ALLOWED: { field: 'type', code: 'NOT_ALLOWED' },
};

const BUDGET_FIELD_ERRORS: Readonly<Record<BudgetRejectionReason, FieldError>> = {
  UNKNOWN_CATEGORY: { field: 'category', code: 'UNKNOWN' },
  CATEGORY_KIND_MISMATCH: { field: 'category', code: 'KIND_MISMATCH' },
  UNSUPPORTED_CURRENCY: { field: 'currency', code: 'UNKNOWN' },
  ENDS_BEFORE_START: { field: 'endsOn', code: 'ENDS_BEFORE_START' },
  DUPLICATE_BUDGET: { field: 'category', code: 'DUPLICATE' },
};

const GOAL_FIELD_ERRORS: Readonly<Record<GoalRejectionReason, FieldError>> = {
  UNSUPPORTED_CURRENCY: { field: 'currency', code: 'UNKNOWN' },
};

export function transactionFieldErrors(
  reasons: readonly TransactionRejectionReason[],
): FieldError[] {
  return uniqueByField(reasons.map((reason) => TRANSACTION_FIELD_ERRORS[reason]));
}

export function budgetFieldErrors(reasons: readonly BudgetRejectionReason[]): FieldError[] {
  return uniqueByField(reasons.map((reason) => BUDGET_FIELD_ERRORS[reason]));
}

export function goalFieldErrors(reasons: readonly GoalRejectionReason[]): FieldError[] {
  return uniqueByField(reasons.map((reason) => GOAL_FIELD_ERRORS[reason]));
}
