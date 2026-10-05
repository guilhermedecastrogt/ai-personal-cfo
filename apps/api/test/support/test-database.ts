import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import { DatabaseError, Pool } from 'pg';
import { loadAppConfig } from '../../src/config/app-config.js';
import type { Database } from '../../src/database/database.js';
import { applyMigrations } from '../../src/database/migrations.js';

export interface TestDatabase {
  readonly database: Database;
  readonly pool: Pool;
  destroy(): Promise<void>;
}

export async function createEmptyTestDatabase(): Promise<TestDatabase> {
  const administrationUrl = loadAppConfig(process.env).databaseUrl;
  const name = `cfo_test_${randomUUID().replaceAll('-', '')}`;
  const administrationPool = new Pool({ connectionString: administrationUrl });
  await administrationPool.query(`create database ${name}`);
  const databaseUrl = new URL(administrationUrl);
  databaseUrl.pathname = `/${name}`;
  const pool = new Pool({ connectionString: databaseUrl.toString() });
  return {
    database: drizzle(pool),
    pool,
    async destroy(): Promise<void> {
      await pool.end();
      await administrationPool.query(`drop database ${name} with (force)`);
      await administrationPool.end();
    },
  };
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
