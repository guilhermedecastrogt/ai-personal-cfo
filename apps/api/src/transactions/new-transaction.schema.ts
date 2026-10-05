import { z } from 'zod';
import { isSupportedCurrency } from '../money/money.js';

const MAXIMUM_MERCHANT_LENGTH = 200;
const MAXIMUM_DESCRIPTION_LENGTH = 500;
const MAXIMUM_SOURCE_MESSAGE_ID_LENGTH = 255;

export const newTransactionSchema = z.object({
  memberId: z.uuid(),
  accountId: z.uuid(),
  transferAccountId: z.uuid().optional(),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  amountMinor: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().refine(isSupportedCurrency),
  merchant: z.string().trim().min(1).max(MAXIMUM_MERCHANT_LENGTH).optional(),
  description: z.string().trim().min(1).max(MAXIMUM_DESCRIPTION_LENGTH).optional(),
  categoryId: z.uuid().optional(),
  expenseScope: z.enum(['HOUSEHOLD', 'INDIVIDUAL']).default('HOUSEHOLD'),
  transactionDate: z.iso.date(),
  paymentMethod: z
    .enum(['CASH', 'DEBIT_CARD', 'CREDIT_CARD', 'BANK_TRANSFER', 'DIRECT_DEBIT', 'OTHER'])
    .optional(),
  source: z.enum(['WHATSAPP_TEXT', 'WHATSAPP_IMAGE', 'WEB', 'MANUAL', 'IMPORT']),
  sourceMessageId: z.string().min(1).max(MAXIMUM_SOURCE_MESSAGE_ID_LENGTH).optional(),
  aiConfidence: z.number().min(0).max(1).optional(),
});

export type NewTransactionInput = z.input<typeof newTransactionSchema>;
export type NewTransaction = z.output<typeof newTransactionSchema>;
