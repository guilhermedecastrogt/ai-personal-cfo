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
  text,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from '../categories/categories.schema.js';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const recurrenceFrequency = pgEnum('recurrence_frequency', [
  'WEEKLY',
  'MONTHLY',
  'QUARTERLY',
  'YEARLY',
]);

export const recurringExpenseStatus = pgEnum('recurring_expense_status', [
  'OBSERVED',
  'CONFIRMED',
  'DISMISSED',
]);

export const recurringExpenses = pgTable(
  'recurring_expenses',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    memberId: uuid('member_id'),
    categoryId: uuid('category_id').references(() => categories.id),
    name: text('name').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    frequency: recurrenceFrequency('frequency').notNull(),
    status: recurringExpenseStatus('status').notNull().default('OBSERVED'),
    lastChargedOn: date('last_charged_on'),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'recurring_expenses_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    index('recurring_expenses_household_id_index').on(table.householdId),
    check('recurring_expenses_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('recurring_expenses_amount_positive', sql`${table.amountMinor} > 0`),
    check('recurring_expenses_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);
