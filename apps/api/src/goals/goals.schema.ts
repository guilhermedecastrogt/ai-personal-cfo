import { sql } from 'drizzle-orm';
import { bigint, char, check, date, index, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households } from '../households/households.schema.js';
import { GOAL_TYPES } from './goal-vocabulary.js';

export const goalType = pgEnum('goal_type', GOAL_TYPES);

export const goalStatus = pgEnum('goal_status', ['ACTIVE', 'ACHIEVED', 'CANCELLED']);

export const goals = pgTable(
  'goals',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    type: goalType('type').notNull(),
    targetAmountMinor: bigint('target_amount_minor', { mode: 'number' }).notNull(),
    currentAmountMinor: bigint('current_amount_minor', { mode: 'number' }).notNull().default(0),
    currency: char('currency', { length: 3 }).notNull(),
    targetDate: date('target_date'),
    status: goalStatus('status').notNull().default('ACTIVE'),
    ...auditTimestamps,
  },
  (table) => [
    index('goals_household_id_index').on(table.householdId),
    check('goals_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('goals_target_amount_positive', sql`${table.targetAmountMinor} > 0`),
    check('goals_current_amount_not_negative', sql`${table.currentAmountMinor} >= 0`),
    check('goals_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);
