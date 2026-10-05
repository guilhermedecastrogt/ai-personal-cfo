import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDatabaseUrl } from '../config/app-config.js';
import { applyMigrations } from './migrations.js';

const pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });

try {
  await applyMigrations(drizzle(pool));
} finally {
  await pool.end();
}
