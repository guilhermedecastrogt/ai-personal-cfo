import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  real,
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { accounts } from '../accounts/accounts.schema.js';
import { categories } from '../categories/categories.schema.js';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';
import {
  EXPENSE_SCOPES,
  PAYMENT_METHODS,
  TRANSACTION_SOURCES,
  TRANSACTION_TYPES,
} from './transaction-vocabulary.js';

export const transactionType = pgEnum('transaction_type', TRANSACTION_TYPES);

export const expenseScope = pgEnum('expense_scope', EXPENSE_SCOPES);

export const paymentMethod = pgEnum('payment_method', PAYMENT_METHODS);

export const transactionSource = pgEnum('transaction_source', TRANSACTION_SOURCES);

export const transactions = pgTable(
  'transactions',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    memberId: uuid('member_id').notNull(),
    accountId: uuid('account_id').notNull(),
    transferAccountId: uuid('transfer_account_id'),
    type: transactionType('type').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    merchant: text('merchant'),
    description: text('description'),
    categoryId: uuid('category_id').references(() => categories.id),
    expenseScope: expenseScope('expense_scope').notNull().default('HOUSEHOLD'),
    transactionDate: date('transaction_date').notNull(),
    paymentMethod: paymentMethod('payment_method'),
    source: transactionSource('source').notNull(),
    sourceMessageId: text('source_message_id'),
    aiConfidence: real('ai_confidence'),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'transactions_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    foreignKey({
      name: 'transactions_account_fk',
      columns: [table.householdId, table.accountId, table.currency],
      foreignColumns: [accounts.householdId, accounts.id, accounts.currency],
    }),
    foreignKey({
      name: 'transactions_transfer_account_fk',
      columns: [table.householdId, table.transferAccountId, table.currency],
      foreignColumns: [accounts.householdId, accounts.id, accounts.currency],
    }),
    check('transactions_amount_positive', sql`${table.amountMinor} > 0`),
    check(
      'transactions_transfer_has_destination',
      sql`(${table.type} = 'TRANSFER') = (${table.transferAccountId} is not null)`,
    ),
    check(
      'transactions_transfer_between_distinct_accounts',
      sql`${table.transferAccountId} <> ${table.accountId}`,
    ),
    check(
      'transactions_transfer_has_no_category',
      sql`${table.type} <> 'TRANSFER' or ${table.categoryId} is null`,
    ),
    check(
      'transactions_ai_confidence_range',
      sql`${table.aiConfidence} >= 0 and ${table.aiConfidence} <= 1`,
    ),
    index('transactions_household_date_index').on(table.householdId, table.transactionDate),
    index('transactions_household_member_date_index').on(
      table.householdId,
      table.memberId,
      table.transactionDate,
    ),
    index('transactions_household_category_date_index').on(
      table.householdId,
      table.categoryId,
      table.transactionDate,
    ),
    index('transactions_account_id_index').on(table.accountId),
    index('transactions_source_message_id_index').on(table.sourceMessageId),
  ],
);
