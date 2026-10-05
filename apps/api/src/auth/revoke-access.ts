import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDatabaseUrl } from '../config/app-config.js';
import { households, members } from '../households/households.schema.js';
import { AuthRepository } from './auth.repository.js';
import { AuthService } from './auth.service.js';

const householdName = process.env.HOUSEHOLD_NAME ?? '';
const memberName = process.env.MEMBER_NAME ?? '';
const pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });

try {
  const database = drizzle(pool);
  const [member] = await database
    .select({ id: members.id, householdId: members.householdId })
    .from(members)
    .innerJoin(households, eq(households.id, members.householdId))
    .where(and(eq(households.name, householdName), eq(members.name, memberName)));
  if (member === undefined) {
    process.stderr.write('No member matches HOUSEHOLD_NAME and MEMBER_NAME\n');
    process.exitCode = 1;
  } else {
    await new AuthService(new AuthRepository(database)).revokeAccess(member.householdId, member.id);
    process.stdout.write('Access revoked\n');
  }
} finally {
  await pool.end();
}
