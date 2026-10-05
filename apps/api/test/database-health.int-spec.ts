import { Logger } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDatabaseUrl } from '../src/config/app-config.js';
import { DatabaseHealth } from '../src/database/database-health.js';

const UNREACHABLE_DATABASE_URL = 'postgres://cfo:cfo@127.0.0.1:1/cfo';

describe('DatabaseHealth', () => {
  let pool: Pool;

  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  afterEach(async () => {
    await pool.end();
  });

  it('is reachable when PostgreSQL accepts the connection', async () => {
    pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });

    await expect(new DatabaseHealth(drizzle(pool)).isReachable()).resolves.toBe(true);
  });

  it('is not reachable when nothing is listening', async () => {
    pool = new Pool({ connectionString: UNREACHABLE_DATABASE_URL });

    await expect(new DatabaseHealth(drizzle(pool)).isReachable()).resolves.toBe(false);
  });
});
