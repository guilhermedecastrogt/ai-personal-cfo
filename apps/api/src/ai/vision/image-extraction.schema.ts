import { z } from 'zod';
import {
  transactionCandidateSchema,
  type TransactionCandidate,
} from '../interpretation/message-interpretation.schema.js';

export const imageExtractionWireSchema = z.object({
  kind: z.enum(['SINGLE_TRANSACTION', 'MULTIPLE_TRANSACTIONS', 'NOT_FINANCIAL', 'UNREADABLE']),
  transaction: transactionCandidateSchema.nullable(),
  transactionCount: z.number().int().nullable(),
});

export type ImageReading =
  | { readonly kind: 'SINGLE_TRANSACTION'; readonly transaction: TransactionCandidate }
  | { readonly kind: 'MULTIPLE_TRANSACTIONS'; readonly transactionCount: number | null }
  | { readonly kind: 'NOT_FINANCIAL' }
  | { readonly kind: 'UNREADABLE' };

export const IMAGE_EXTRACTION_SCHEMA_NAME = 'image_transaction_extraction';

export function imageExtractionJsonSchema(): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(z.toJSONSchema(imageExtractionWireSchema)).filter(
      ([keyword]) => keyword !== '$schema',
    ),
  );
}
