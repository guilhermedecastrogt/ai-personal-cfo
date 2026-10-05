export const TRANSACTION_TYPES = ['EXPENSE', 'INCOME', 'TRANSFER'] as const;

export const EXPENSE_SCOPES = ['HOUSEHOLD', 'INDIVIDUAL'] as const;

export const PAYMENT_METHODS = [
  'CASH',
  'DEBIT_CARD',
  'CREDIT_CARD',
  'BANK_TRANSFER',
  'DIRECT_DEBIT',
  'OTHER',
] as const;

export const TRANSACTION_SOURCES = [
  'WHATSAPP_TEXT',
  'WHATSAPP_IMAGE',
  'WEB',
  'MANUAL',
  'IMPORT',
] as const;

export type TransactionType = (typeof TRANSACTION_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type TransactionSource = (typeof TRANSACTION_SOURCES)[number];
