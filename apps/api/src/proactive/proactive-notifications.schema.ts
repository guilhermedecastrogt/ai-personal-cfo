import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households, members } from '../households/households.schema.js';

export const notificationStatus = pgEnum('notification_status', [
  'PENDING',
  'SENT',
  'FAILED',
  'SUPPRESSED',
]);

export const deliveryStatus = pgEnum('notification_delivery_status', ['SENDING', 'SENT', 'FAILED']);

export const proactiveNotifications = pgTable(
  'proactive_notifications',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    eventKey: text('event_key').notNull(),
    type: text('type').notNull(),
    severity: text('severity').notNull(),
    level: integer('level').notNull(),
    currency: text('currency').notNull(),
    period: text('period').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    status: notificationStatus('status').notNull(),
    statusReason: text('status_reason'),
    firstDetectedAt: timestamp('first_detected_at', { withTimezone: true }).notNull(),
    lastDetectedAt: timestamp('last_detected_at', { withTimezone: true }).notNull(),
    lastNotifiedAt: timestamp('last_notified_at', { withTimezone: true }),
    readAt: timestamp('read_at', { withTimezone: true }),
    ...auditTimestamps,
  },
  (table) => [
    unique('proactive_notifications_household_event_key_unique').on(
      table.householdId,
      table.eventKey,
    ),
    index('proactive_notifications_household_detected_index').on(
      table.householdId,
      table.lastDetectedAt,
    ),
    check('proactive_notifications_level_positive', sql`${table.level} > 0`),
  ],
);

export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    ...identifier,
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => proactiveNotifications.id, { onDelete: 'cascade' }),
    householdId: uuid('household_id').notNull(),
    memberId: uuid('member_id').notNull(),
    channel: text('channel').notNull(),
    level: integer('level').notNull(),
    status: deliveryStatus('status').notNull().default('SENDING'),
    attempts: integer('attempts').notNull().default(1),
    ...auditTimestamps,
  },
  (table) => [
    foreignKey({
      name: 'notification_deliveries_member_fk',
      columns: [table.householdId, table.memberId],
      foreignColumns: [members.householdId, members.id],
    }),
    unique('notification_deliveries_once_per_recipient_unique').on(
      table.notificationId,
      table.memberId,
      table.channel,
      table.level,
    ),
    index('notification_deliveries_household_index').on(table.householdId, table.updatedAt),
  ],
);

export const evaluationLeases = pgTable('evaluation_leases', {
  name: text('name').primaryKey(),
  holder: text('holder').notNull(),
  lockedUntil: timestamp('locked_until', { withTimezone: true }).notNull(),
});
