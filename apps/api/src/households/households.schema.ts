import { sql } from 'drizzle-orm';
import { char, check, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, creationTimestamp, identifier } from '../database/columns.js';

export const households = pgTable(
  'households',
  {
    ...identifier,
    name: text('name').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    ...auditTimestamps,
  },
  (table) => [
    check('households_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('households_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('households_timezone_not_blank', sql`length(trim(${table.timezone})) > 0`),
    check('households_locale_supported', sql`${table.locale} in ('en', 'pt-BR')`),
  ],
);

export const members = pgTable(
  'members',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    ...auditTimestamps,
  },
  (table) => [
    unique('members_household_id_id_unique').on(table.householdId, table.id),
    check('members_name_not_blank', sql`length(trim(${table.name})) > 0`),
  ],
);

export const whatsappIdentities = pgTable(
  'whatsapp_identities',
  {
    ...identifier,
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    provider: text('provider').notNull(),
    externalUserId: text('external_user_id').notNull(),
    phoneNumber: text('phone_number').notNull(),
    ...creationTimestamp,
  },
  (table) => [
    unique('whatsapp_identities_provider_external_user_id_unique').on(
      table.provider,
      table.externalUserId,
    ),
    index('whatsapp_identities_member_id_index').on(table.memberId),
    check('whatsapp_identities_provider_not_blank', sql`length(trim(${table.provider})) > 0`),
    check(
      'whatsapp_identities_external_user_id_not_blank',
      sql`length(trim(${table.externalUserId})) > 0`,
    ),
    check(
      'whatsapp_identities_phone_number_e164',
      sql`${table.phoneNumber} ~ '^\\+[1-9][0-9]{6,14}$'`,
    ),
  ],
);
