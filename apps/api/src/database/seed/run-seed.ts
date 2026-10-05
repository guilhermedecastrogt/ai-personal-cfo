import { readFile } from 'node:fs/promises';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadAppConfig } from '../../config/app-config.js';
import { demoHousehold } from './demo-household.js';
import { seedDefinitionSchema, type SeedDefinition } from './seed-definition.js';
import { seedHousehold } from './seed-household.js';

async function loadSeedDefinition(filePath: string | undefined): Promise<SeedDefinition> {
  if (filePath === undefined) {
    return seedDefinitionSchema.parse(demoHousehold);
  }
  const contents: unknown = JSON.parse(await readFile(filePath, 'utf8'));
  return seedDefinitionSchema.parse(contents);
}

const definition = await loadSeedDefinition(process.env.SEED_DEFINITION_FILE);
const pool = new Pool({ connectionString: loadAppConfig(process.env).databaseUrl });

try {
  await seedHousehold(drizzle(pool), definition);
  process.stdout.write(
    `Seeded one household with ${String(definition.members.length)} members and ${String(definition.accounts.length)} accounts\n`,
  );
} finally {
  await pool.end();
}
