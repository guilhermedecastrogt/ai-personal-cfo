import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadAppConfig } from '../config/app-config.js';
import { applyMigrations } from './migrations.js';

const pool = new Pool({ connectionString: loadAppConfig(process.env).databaseUrl });

try {
  await applyMigrations(drizzle(pool));
} finally {
  await pool.end();
}
