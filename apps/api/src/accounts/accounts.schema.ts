import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  foreignKey,
  pgEnum,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const accountType = pgEnum('account_type', ['BANK', 'CASH', 'CREDIT_CARD', 'SAVINGS']);

export const accounts = pgTable(
  'accounts',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    ownerMemberId: uuid('owner_member_id'),
    name: text('name').notNull(),
    type: accountType('type').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    openingBalanceMinor: bigint('opening_balance_minor', { mode: 'number' }).notNull().default(0),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'accounts_owner_member_fk',
      columns: [table.householdId, table.ownerMemberId],
      foreignColumns: [members.householdId, members.id],
    }),
    unique('accounts_household_id_id_currency_unique').on(
      table.householdId,
      table.id,
      table.currency,
    ),
    unique('accounts_household_id_id_unique').on(table.householdId, table.id),
    unique('accounts_household_id_name_unique').on(table.householdId, table.name),
    check('accounts_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('accounts_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);

export const memberDefaultAccounts = pgTable(
  'member_default_accounts',
  {
    memberId: uuid('member_id').primaryKey(),
    householdId: uuid('household_id').notNull(),
    accountId: uuid('account_id').notNull(),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'member_default_accounts_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    foreignKey({
      name: 'member_default_accounts_account_fk',
      columns: [table.householdId, table.accountId],
      foreignColumns: [accounts.householdId, accounts.id],
    }),
  ],
);
