import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseError, Pool } from 'pg';
import { loadDatabaseUrl } from '../../src/config/app-config.js';
import type { Database } from '../../src/database/database.js';
import { applyMigrations } from '../../src/database/migrations.js';

export interface TestDatabase {
  readonly url: string;
  readonly database: Database;
  readonly pool: Pool;
  destroy(): Promise<void>;
}

export async function createEmptyTestDatabase(): Promise<TestDatabase> {
  const administrationUrl = loadDatabaseUrl(process.env);
  const name = `cfo_test_${randomUUID().replaceAll('-', '')}`;
  const administrationPool = new Pool({ connectionString: administrationUrl });
  await administrationPool.query(`create database ${name}`);
  const databaseUrl = new URL(administrationUrl);
  databaseUrl.pathname = `/${name}`;
  const pool = new Pool({ connectionString: databaseUrl.toString() });
  return {
    url: databaseUrl.toString(),
    database: drizzle(pool),
    pool,
    async destroy(): Promise<void> {
      await pool.end();
      await waitForDisconnection(administrationPool, name);
      await administrationPool.query(`drop database ${name} with (force)`);
      await administrationPool.end();
    },
  };
}

const DISCONNECTION_CHECKS = 100;
const DISCONNECTION_CHECK_INTERVAL_IN_MILLISECONDS = 10;

async function waitForDisconnection(administrationPool: Pool, name: string): Promise<void> {
  for (let check = 0; check < DISCONNECTION_CHECKS; check += 1) {
    const result = await administrationPool.query<{ connections: string }>(
      'select count(*) as connections from pg_stat_activity where datname = $1',
      [name],
    );
    if (result.rows[0]?.connections === '0') {
      return;
    }
    await delay(DISCONNECTION_CHECK_INTERVAL_IN_MILLISECONDS);
  }
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const testDatabase = await createEmptyTestDatabase();
  await applyMigrations(testDatabase.database);
  return testDatabase;
}

export async function violatedConstraint(statement: PromiseLike<unknown>): Promise<string> {
  try {
    await statement;
  } catch (error) {
    return findConstraint(error);
  }
  return 'none';
}

function findConstraint(error: unknown): string {
  if (error instanceof DatabaseError) {
    return error.constraint ?? 'unnamed';
  }
  if (error instanceof Error) {
    return findConstraint(error.cause);
  }
  return 'unknown';
}
