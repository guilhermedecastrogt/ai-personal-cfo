import { sql } from 'drizzle-orm';
import { check, foreignKey, index, jsonb, pgEnum, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const insightType = pgEnum('insight_type', [
  'BUDGET_WARNING',
  'SPENDING_TREND',
  'ANOMALY',
  'RECURRING_EXPENSE',
  'GOAL_RISK',
  'SAVINGS_RECOMMENDATION',
]);

export const insightSeverity = pgEnum('insight_severity', [
  'INFO',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

export const insightStatus = pgEnum('insight_status', ['PENDING', 'DELIVERED', 'DISMISSED']);

export const insights = pgTable(
  'insights',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    memberId: uuid('member_id'),
    type: insightType('type').notNull(),
    severity: insightSeverity('severity').notNull(),
    title: text('title').notNull(),
    payload: jsonb('payload').notNull().default({}),
    status: insightStatus('status').notNull().default('PENDING'),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'insights_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    index('insights_household_status_index').on(table.householdId, table.status),
    check('insights_title_not_blank', sql`length(trim(${table.title})) > 0`),
  ],
);
