import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDatabaseUrl } from '../config/app-config.js';
import { applyMigrations } from './migrations.js';

const pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });

try {
  await applyMigrations(drizzle(pool));
  process.stdout.write('event=migrations-applied\n');
} catch (error) {
  const name = error instanceof Error ? error.name : 'unknown';
  const code = (error as { code?: unknown }).code;
  process.stderr.write(
    `event=migrations-failed error=${name} code=${typeof code === 'string' ? code : 'none'}\n`,
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
