import { sql } from 'drizzle-orm';
import {
  bigint,
  char,
  check,
  date,
  pgEnum,
  pgTable,
  smallint,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { categories } from '../categories/categories.schema.js';
import { auditTimestamps, identifier } from '../database/columns.js';
import { households } from '../households/households.schema.js';
import { BUDGET_PERIODS } from './budget-vocabulary.js';

export const budgetPeriod = pgEnum('budget_period', BUDGET_PERIODS);

export const DEFAULT_ALERT_THRESHOLD_PERCENT = 80;

export const budgets = pgTable(
  'budgets',
  {
    ...identifier,
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    categoryId: uuid('category_id').references(() => categories.id),
    period: budgetPeriod('period').notNull(),
    limitMinor: bigint('limit_minor', { mode: 'number' }).notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    alertThresholdPercent: smallint('alert_threshold_percent')
      .notNull()
      .default(DEFAULT_ALERT_THRESHOLD_PERCENT),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on'),
    ...auditTimestamps,
  },
  (table) => [
    unique('budgets_household_category_period_currency_start_unique')
      .on(table.householdId, table.categoryId, table.period, table.currency, table.startsOn)
      .nullsNotDistinct(),
    check('budgets_limit_positive', sql`${table.limitMinor} > 0`),
    check('budgets_currency_format', sql`${table.currency} ~ '^[A-Z]{3}$'`),
    check('budgets_alert_threshold_range', sql`${table.alertThresholdPercent} between 1 and 100`),
    check('budgets_ends_after_start', sql`${table.endsOn} >= ${table.startsOn}`),
  ],
);
