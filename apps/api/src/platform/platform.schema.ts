import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { creationTimestamp, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const platformAdmins = pgTable(
  'platform_admins',
  {
    memberId: uuid('member_id').primaryKey(),
    householdId: uuid('household_id').notNull(),
    grantedByMemberId: uuid('granted_by_member_id').references(() => members.id),
    ...creationTimestamp,
  },
  (table) => [
    foreignKey({
      name: 'platform_admins_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
  ],
);

export const platformActions = pgTable(
  'platform_actions',
  {
    ...identifier,
    actorMemberId: uuid('actor_member_id')
      .notNull()
      .references(() => members.id),
    action: text('action').notNull(),
    householdId: uuid('household_id').references(() => households.id),
    memberId: uuid('member_id').references(() => members.id),
    ...creationTimestamp,
  },
  (table) => [
    check('platform_actions_action_not_blank', sql`length(trim(${table.action})) > 0`),
    index('platform_actions_created_at_index').on(table.createdAt),
    index('platform_actions_household_id_index').on(table.householdId),
  ],
);
