import { z } from 'zod';
import { PAYMENT_METHODS, TRANSACTION_TYPES } from '../../transactions/transaction-vocabulary.js';

export const WEEKDAYS = [
  'MONDAY',
  'TUESDAY',
  'WEDNESDAY',
  'THURSDAY',
  'FRIDAY',
  'SATURDAY',
  'SUNDAY',
] as const;

export const FINANCIAL_INTENTS = [
  'SPENDING_TOTAL',
  'SPENDING_BY_CATEGORY',
  'SPENDING_BY_MEMBER',
  'SPENDING_BY_ACCOUNT',
  'INCOME_TOTAL',
  'CASH_FLOW',
  'SAVINGS',
  'BUDGET_STATUS',
  'GOAL_PROGRESS',
  'SPENDING_TREND',
  'RECURRING_EXPENSES',
  'RECURRING_UPCOMING',
  'RECURRING_CHANGES',
  'ACCOUNT_BALANCE',
  'FORECAST',
  'INSIGHTS',
  'MONTHLY_REVIEW',
  'SPENDING_CHANGE',
  'LARGEST_EXPENSES',
] as const;

export const QUESTION_SLOTS = ['INTENT', 'PERIOD', 'CATEGORY', 'ACCOUNT', 'MEMBER'] as const;

export const dateReferenceSchema = z.object({
  kind: z.enum([
    'UNSPECIFIED',
    'TODAY',
    'YESTERDAY',
    'DAYS_AGO',
    'WEEKDAY',
    'DAY_OF_MONTH',
    'EXPLICIT_DATE',
  ]),
  daysAgo: z.number().int().nullable(),
  weekday: z.enum(WEEKDAYS).nullable(),
  dayOfMonth: z.number().int().nullable(),
  isoDate: z.string().nullable(),
});

export const MEMBER_REFERENCES = ['SENDER', 'NAMED', 'THIRD_PERSON_UNSTATED'] as const;

export const transactionCandidateSchema = z.object({
  type: z.enum(TRANSACTION_TYPES).nullable(),
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  category: z.string().nullable(),
  account: z.string().nullable(),
  transferAccount: z.string().nullable(),
  member: z.string().nullable(),
  memberReference: z.enum(MEMBER_REFERENCES),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable(),
  date: dateReferenceSchema,
  confidence: z.number().min(0).max(1),
});

export const periodReferenceSchema = z.object({
  kind: z.enum([
    'UNSPECIFIED',
    'CURRENT_MONTH',
    'PREVIOUS_MONTH',
    'CURRENT_WEEK',
    'PREVIOUS_WEEK',
    'CURRENT_YEAR',
    'LAST_DAYS',
    'SPECIFIC_MONTH',
  ]),
  days: z.number().int().nullable(),
  year: z.number().int().nullable(),
  month: z.number().int().nullable(),
});

export const financialQuestionSchema = z.object({
  intent: z.enum(FINANCIAL_INTENTS),
  period: periodReferenceSchema,
  category: z.string().nullable(),
  account: z.string().nullable(),
  memberScope: z.enum(['HOUSEHOLD', 'SENDER', 'NAMED_MEMBER']),
  memberName: z.string().nullable(),
  inheritFromPrevious: z.array(z.enum(QUESTION_SLOTS)),
});

export const messageInterpretationWireSchema = z.object({
  kind: z.enum(['TRANSACTION', 'QUESTION', 'CORRECTION', 'UNCLEAR', 'OTHER']),
  transaction: transactionCandidateSchema.nullable(),
  completesPendingTransaction: z.boolean(),
  question: financialQuestionSchema.nullable(),
});

export type DateReference = z.infer<typeof dateReferenceSchema>;
export type TransactionCandidate = z.infer<typeof transactionCandidateSchema>;
export type PeriodReference = z.infer<typeof periodReferenceSchema>;
export type FinancialQuestion = z.infer<typeof financialQuestionSchema>;
export type FinancialIntent = (typeof FINANCIAL_INTENTS)[number];
export type Weekday = (typeof WEEKDAYS)[number];

export type QuestionSlot = (typeof QUESTION_SLOTS)[number];

export type MessageInterpretation =
  | {
      readonly kind: 'TRANSACTION';
      readonly transaction: TransactionCandidate;
      readonly completesPending: boolean;
    }
  | { readonly kind: 'QUESTION'; readonly question: FinancialQuestion }
  | { readonly kind: 'CORRECTION' }
  | { readonly kind: 'UNCLEAR' }
  | { readonly kind: 'OTHER' };

export const MESSAGE_INTERPRETATION_SCHEMA_NAME = 'message_interpretation';

export function messageInterpretationJsonSchema(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(messageInterpretationWireSchema)).filter(
      ([keyword]) => keyword !== '$schema',
    ),
  );
}
