import { timestamp, uuid } from 'drizzle-orm/pg-core';

export const identifier = {
  id: uuid('id').primaryKey().defaultRandom(),
};

export const creationTimestamp = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
};

export const auditTimestamps = {
  ...creationTimestamp,
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
