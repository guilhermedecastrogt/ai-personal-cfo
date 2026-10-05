import { z } from 'zod';
import { BUDGET_PERIODS } from '../budgets/budget-vocabulary.js';
import { GOAL_TYPES } from '../goals/goal-vocabulary.js';
import { EXPENSE_SCOPES, TRANSACTION_TYPES } from '../transactions/transaction-vocabulary.js';
import type { FieldError } from './dashboard.contracts.js';

const MAXIMUM_AMOUNT_TEXT_LENGTH = 40;
const MAXIMUM_MERCHANT_LENGTH = 200;
const MAXIMUM_DESCRIPTION_LENGTH = 500;
const MAXIMUM_GOAL_NAME_LENGTH = 120;
const MINIMUM_ALERT_PERCENT = 1;
const MAXIMUM_ALERT_PERCENT = 100;

const amountText = z.string().max(MAXIMUM_AMOUNT_TEXT_LENGTH);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);
const version = z.iso.datetime();

function optionalText(maximum: number): z.ZodType<string | null, string> {
  return z
    .string()
    .max(maximum)
    .transform((value) => (value.trim() === '' ? null : value.trim()));
}

const optionalKey = z
  .union([z.uuid(), z.literal('')])
  .transform((value) => (value === '' ? null : value));

const optionalDate = z
  .union([z.iso.date(), z.literal('')])
  .transform((value) => (value === '' ? null : value));

export const transactionEditRequestSchema = z.object({
  version,
  type: z.enum(TRANSACTION_TYPES),
  amount: amountText,
  date: z.iso.date(),
  merchant: optionalText(MAXIMUM_MERCHANT_LENGTH),
  description: optionalText(MAXIMUM_DESCRIPTION_LENGTH),
  category: optionalKey,
  member: z.uuid(),
  account: z.uuid(),
  expenseScope: z.enum(EXPENSE_SCOPES),
});

export const budgetRequestSchema = z.object({
  category: optionalKey,
  period: z.enum(BUDGET_PERIODS),
  limit: amountText,
  currency: currencyCode,
  alertThresholdPercent: z.coerce
    .number()
    .int()
    .min(MINIMUM_ALERT_PERCENT)
    .max(MAXIMUM_ALERT_PERCENT),
  startsOn: z.iso.date(),
  endsOn: optionalDate,
});

export const budgetEditRequestSchema = budgetRequestSchema.extend({ version });

export const goalRequestSchema = z.object({
  name: z.string().trim().min(1).max(MAXIMUM_GOAL_NAME_LENGTH),
  type: z.enum(GOAL_TYPES),
  target: amountText,
  saved: amountText,
  currency: currencyCode,
  targetDate: optionalDate,
});

export const goalEditRequestSchema = goalRequestSchema.extend({ version });

export type TransactionEditRequest = z.output<typeof transactionEditRequestSchema>;
export type BudgetRequest = z.output<typeof budgetRequestSchema>;
export type GoalRequest = z.output<typeof goalRequestSchema>;
export type BudgetEditRequest = z.output<typeof budgetEditRequestSchema>;
export type GoalEditRequest = z.output<typeof goalEditRequestSchema>;

export type ParsedRequest<Request> =
  | { readonly success: true; readonly data: Request }
  | { readonly success: false; readonly errors: FieldError[] };

export function parseRequest<Schema extends z.ZodType>(
  schema: Schema,
  body: unknown,
): ParsedRequest<z.output<Schema>> {
  const parsed = schema.safeParse(body);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }
  const provided =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors = parsed.error.issues.map((issue): FieldError => {
    const [first] = issue.path;
    const field = typeof first === 'string' ? first : 'form';
    return { field, code: provided[field] === undefined ? 'REQUIRED' : 'INVALID' };
  });
  return { success: false, errors: uniqueByField(errors) };
}

export function uniqueByField(errors: readonly FieldError[]): FieldError[] {
  const seen = new Set<string>();
  return errors.filter((error) => {
    if (seen.has(error.field)) {
      return false;
    }
    seen.add(error.field);
    return true;
  });
}
