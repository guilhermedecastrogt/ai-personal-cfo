import { sql } from 'drizzle-orm';
import { type AnyPgColumn, check, pgEnum, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { auditTimestamps, identifier } from '../database/columns.js';

export const categoryKind = pgEnum('category_kind', ['EXPENSE', 'INCOME']);

export const categories = pgTable(
  'categories',
  {
    ...identifier,
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    name: text('name').notNull(),
    kind: categoryKind('kind').notNull(),
    ...auditTimestamps,
  },
  (table) => [
    unique('categories_parent_id_name_unique').on(table.parentId, table.name).nullsNotDistinct(),
    check('categories_name_not_blank', sql`length(trim(${table.name})) > 0`),
    check('categories_not_own_parent', sql`${table.parentId} <> ${table.id}`),
  ],
);
