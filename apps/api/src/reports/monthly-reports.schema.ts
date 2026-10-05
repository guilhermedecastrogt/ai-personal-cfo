import { sql } from 'drizzle-orm';
import { char, check, jsonb, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households } from '../households/households.schema.js';

export const monthlyReports = pgTable(
  'monthly_reports',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    year: smallint('year').notNull(),
    month: smallint('month').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    content: jsonb('content').notNull(),
    narrative: text('narrative'),
    ...auditTimestamps,
  },
  (table) => [
    unique('monthly_reports_household_year_month_currency_unique').on(
      table.householdId,
      table.year,
      table.month,
      table.currency,
    ),
    check('monthly_reports_month_range', sql`${table.month} between 1 and 12`),
    check('monthly_reports_year_range', sql`${table.year} between 2000 and 9999`),
    check('monthly_reports_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
  ],
);
