import { sql } from 'drizzle-orm';
import { check, pgEnum, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { identifier } from '../database/columns.js';

export const webhookEventStatus = pgEnum('webhook_event_status', [
  'RECEIVED',
  'PROCESSED',
  'IGNORED',
  'FAILED',
]);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    ...identifier,
    provider: text('provider').notNull(),
    externalEventId: text('external_event_id').notNull(),
    status: webhookEventStatus('status').notNull().default('RECEIVED'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    unique('webhook_events_provider_external_event_id_unique').on(
      table.provider,
      table.externalEventId,
    ),
    check('webhook_events_provider_not_blank', sql`length(trim(${table.provider})) > 0`),
    check(
      'webhook_events_external_event_id_not_blank',
      sql`length(trim(${table.externalEventId})) > 0`,
    ),
  ],
);
