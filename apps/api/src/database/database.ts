import type { NodePgDatabase } from 'drizzle-orm/node-postgres';

export type Database = NodePgDatabase;

export const DATABASE = Symbol('DATABASE');
export const DATABASE_POOL = Symbol('DATABASE_POOL');
