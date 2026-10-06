import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { creationTimestamp, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';
import { transactions } from '../transactions/transactions.schema.js';
import { goals } from './goals.schema.js';

export const goalContributions = pgTable(
  'goal_contributions',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    goalId: uuid('goal_id').notNull(),
    memberId: uuid('member_id').notNull(),
    transactionId: uuid('transaction_id'),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    contributionDate: date('contribution_date').notNull(),
    ...creationTimestamp,
  },
  (table) => [
    foreignKey({
      name: 'goal_contributions_goal_fk',
      columns: [table.householdId, table.goalId, table.currency],
      foreignColumns: [goals.householdId, goals.id, goals.currency],
    }).onDelete('cascade'),
    foreignKey({
      name: 'goal_contributions_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    foreignKey({
      name: 'goal_contributions_transaction_fk',
      columns: [table.householdId, table.transactionId],
      foreignColumns: [transactions.householdId, transactions.id],
    }).onDelete('restrict'),
    uniqueIndex('goal_contributions_transaction_unique')
      .on(table.transactionId)
      .where(sql`${table.transactionId} is not null`),
    index('goal_contributions_household_goal_index').on(table.householdId, table.goalId),
    check('goal_contributions_amount_positive', sql`${table.amountMinor} > 0`),
  ],
);
