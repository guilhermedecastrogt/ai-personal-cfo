import { foreignKey, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { creationTimestamp, identifier } from '../database/columns.js';
import { members } from '../households/households.schema.js';

export const memberAccessCodes = pgTable(
  'member_access_codes',
  {
    memberId: uuid('member_id').primaryKey(),
    householdId: uuid('household_id').notNull(),
    codeHash: text('code_hash').notNull(),
    ...creationTimestamp,
  },
  (table) => [
    foreignKey({
      name: 'member_access_codes_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    unique('member_access_codes_code_hash_unique').on(table.codeHash),
  ],
);

export const dashboardSessions = pgTable(
  'dashboard_sessions',
  {
    ...identifier,
    householdId: uuid('household_id').notNull(),
    memberId: uuid('member_id').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...creationTimestamp,
  },
  (table) => [
    foreignKey({
      name: 'dashboard_sessions_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    unique('dashboard_sessions_token_hash_unique').on(table.tokenHash),
    index('dashboard_sessions_expires_at_index').on(table.expiresAt),
  ],
);
