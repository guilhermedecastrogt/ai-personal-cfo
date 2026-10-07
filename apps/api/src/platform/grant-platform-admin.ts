import { z } from 'zod';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AuthRepository } from '../auth/auth.repository.js';
import { memberCredentials } from '../auth/auth.schema.js';
import { AuthService } from '../auth/auth.service.js';
import { loadDatabaseUrl } from '../config/app-config.js';
import type { Database } from '../database/database.js';
import { isSupportedTimeZone } from '../finance/domain/period/period.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { households, members } from '../households/households.schema.js';
import { isLocale } from '../i18n/locale.js';
import { isSupportedCurrency } from '../money/money.js';
import { PlatformAdminsRepository } from './platform-admins.repository.js';

interface Target {
  readonly householdId: string;
  readonly memberId: string;
}

const email = (process.env.EMAIL ?? '').trim().toLowerCase();
const memberName = (process.env.MEMBER_NAME ?? '').trim();
const householdName = (process.env.HOUSEHOLD_NAME ?? memberName).trim();
const currency = (process.env.CURRENCY ?? 'BRL').trim().toUpperCase();
const timezone = (process.env.TIMEZONE ?? 'America/Sao_Paulo').trim();
const locale = (process.env.LOCALE ?? 'pt-BR').trim();
const mayCreate = process.env.CREATE_IF_MISSING === 'true';

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}

async function findByEmail(database: Database): Promise<Target | undefined> {
  const [target] = await database
    .select({ householdId: memberCredentials.householdId, memberId: memberCredentials.memberId })
    .from(memberCredentials)
    .where(eq(memberCredentials.email, email));
  return target;
}

async function findByName(database: Database): Promise<Target | undefined> {
  const [target] = await database
    .select({ householdId: members.householdId, memberId: members.id })
    .from(members)
    .innerJoin(households, eq(households.id, members.householdId))
    .where(and(eq(households.name, householdName), eq(members.name, memberName)));
  return target;
}

async function createHousehold(database: Database): Promise<Target> {
  const household = await new HouseholdsRepository(database).createHouseholdWithMembers(
    { name: householdName, currency, timezone, locale },
    [memberName],
  );
  const [member] = await new HouseholdsRepository(database).listMembers(household.id);
  if (member === undefined) {
    throw new Error('The household was created without its member');
  }
  process.stdout.write('Household and member created\n');
  return { householdId: household.id, memberId: member.id };
}

function validateInput(): boolean {
  if (email !== '' && !z.email().safeParse(email).success) {
    fail('EMAIL is not a valid email address');
  }
  if (email === '' && memberName === '') {
    fail('Set EMAIL, or MEMBER_NAME with HOUSEHOLD_NAME, to name the member');
  }
  if (mayCreate && memberName === '') {
    fail('CREATE_IF_MISSING needs MEMBER_NAME');
  }
  if (mayCreate && !isSupportedCurrency(currency)) {
    fail('CURRENCY is not an ISO 4217 code');
  }
  if (mayCreate && !isSupportedTimeZone(timezone)) {
    fail('TIMEZONE is not a known time zone');
  }
  if (mayCreate && !isLocale(locale)) {
    fail('LOCALE must be en or pt-BR');
  }
  return process.exitCode === undefined;
}

async function run(database: Database): Promise<void> {
  let target = email === '' ? undefined : await findByEmail(database);
  target ??= memberName === '' ? undefined : await findByName(database);
  if (target === undefined && mayCreate) {
    target = await createHousehold(database);
  }
  if (target === undefined) {
    fail('No member matches. Nothing was changed. Set CREATE_IF_MISSING=true to create one');
    return;
  }
  const auth = new AuthService(new AuthRepository(database));
  if (email !== '') {
    const states = await auth.accessStates(target.householdId);
    const current = states.find((state) => state.memberId === target.memberId);
    if (current?.email !== undefined && current.email !== null && current.email !== email) {
      fail('The member already has another email. Nothing was changed');
      return;
    }
    if (
      current?.email !== email &&
      !(await auth.registerEmail(target.householdId, target.memberId, email))
    ) {
      fail('EMAIL already belongs to another member. Nothing was changed');
      return;
    }
  }
  const granted = await new PlatformAdminsRepository(database).grant(
    target.householdId,
    target.memberId,
    null,
  );
  process.stdout.write(granted ? 'Platform admin granted\n' : 'Already a platform admin\n');
  const states = await auth.accessStates(target.householdId);
  const access = states.find((state) => state.memberId === target.memberId);
  if (access?.hasPassword !== true && access?.hasInvitation !== true) {
    const code = await auth.issueAccessCode(target.householdId, target.memberId);
    process.stdout.write(`Access code, shown once: ${code}\n`);
  }
}

if (validateInput()) {
  const pool = new Pool({ connectionString: loadDatabaseUrl(process.env) });
  try {
    await run(drizzle(pool));
  } finally {
    await pool.end();
  }
}
