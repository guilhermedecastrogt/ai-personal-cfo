import { z } from 'zod';
import {
  FINANCIAL_INTENTS,
  periodReferenceSchema,
  MEMBER_REFERENCES,
  correctionTargetSchema,
  transactionCandidateSchema,
} from '../ai/interpretation/message-interpretation.schema.js';

export const CONVERSATION_OUTCOMES = [
  'NONE',
  'TRANSACTION_RECORDED',
  'TRANSACTIONS_RECORDED',
  'TRANSACTION_PENDING',
  'TRANSACTION_CORRECTED',
  'TRANSACTION_DELETED',
  'CORRECTION_PENDING',
  'DELETION_PENDING',
  'QUESTION_ANSWERED',
  'QUESTION_PENDING',
  'REVIEW_GIVEN',
] as const;

export const questionFrameSchema = z.object({
  intent: z.enum(FINANCIAL_INTENTS),
  period: periodReferenceSchema,
  category: z.string().nullable(),
  account: z.string().nullable(),
  memberScope: z.enum(['HOUSEHOLD', 'SENDER', 'NAMED_MEMBER']),
  memberName: z.string().nullable(),
});

export const MAXIMUM_QUEUED_TRANSACTIONS = 4;

export const pendingTransactionSchema = z.object({
  candidate: transactionCandidateSchema.extend({
    member: z.string().nullable().default(null),
    memberReference: z.enum(MEMBER_REFERENCES).default('SENDER'),
  }),
  reasons: z.array(z.string()),
  medium: z.enum(['TEXT', 'IMAGE']),
  sourceMessageId: z.string().nullable(),
});

export const conversationStateSchema = z.object({
  lastOutcome: z.enum(CONVERSATION_OUTCOMES),
  question: questionFrameSchema.nullable(),
  pendingTransaction: pendingTransactionSchema.nullable(),
  queuedTransactions: z
    .array(pendingTransactionSchema)
    .max(MAXIMUM_QUEUED_TRANSACTIONS)
    .default([]),
  pendingDeletion: z
    .object({ target: correctionTargetSchema, version: z.iso.datetime() })
    .nullable()
    .default(null),
});

export type QuestionFrame = z.infer<typeof questionFrameSchema>;
export type PendingTransaction = z.infer<typeof pendingTransactionSchema>;
export type PendingDeletion = NonNullable<ConversationState['pendingDeletion']>;
export type ConversationState = z.infer<typeof conversationStateSchema>;

export const EMPTY_CONVERSATION_STATE: ConversationState = {
  lastOutcome: 'NONE',
  question: null,
  pendingTransaction: null,
  queuedTransactions: [],
  pendingDeletion: null,
};

const MILLISECONDS_PER_MINUTE = 60_000;
const OUT_OF_ORDER_TOLERANCE_IN_MILLISECONDS = 60_000;

export function readConversationState(
  stored: unknown,
  storedAt: Date | null,
  instant: Date,
  lifetimeInMinutes: number,
): ConversationState {
  const parsed = conversationStateSchema.safeParse(stored);
  const age = storedAt === null ? Number.POSITIVE_INFINITY : instant.getTime() - storedAt.getTime();
  const isCurrent =
    age >= -OUT_OF_ORDER_TOLERANCE_IN_MILLISECONDS &&
    age <= lifetimeInMinutes * MILLISECONDS_PER_MINUTE;
  return parsed.success && isCurrent ? parsed.data : EMPTY_CONVERSATION_STATE;
}
