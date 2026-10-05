import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDatabaseUrl } from '../config/app-config.js';
import { isLocale, LOCALES } from '../i18n/locale.js';
import { households } from './households.schema.js';

const householdName = process.env.HOUSEHOLD_NAME ?? '';
const locale = process.env.LOCALE ?? '';

if (!isLocale(locale)) {
  process.stderr.write(`LOCALE must be one of: ${LOCALES.join(', ')}\n`);
  process.exitCode = 1;
} else {
  const pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });
  try {
    const updated = await drizzle(pool)
      .update(households)
      .set({ locale, updatedAt: new Date() })
      .where(eq(households.name, householdName))
      .returning({ id: households.id });
    if (updated.length === 0) {
      process.stderr.write('No household matches HOUSEHOLD_NAME\n');
      process.exitCode = 1;
    } else {
      process.stdout.write(`Language set to ${locale}\n`);
    }
  } finally {
    await pool.end();
  }
}
