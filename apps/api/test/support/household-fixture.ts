import { AccountsRepository, type Account } from '../../src/accounts/accounts.repository.js';
import type { Database } from '../../src/database/database.js';
import {
  HouseholdsRepository,
  type Household,
  type Member,
} from '../../src/households/households.repository.js';

export interface HouseholdFixture {
  readonly household: Household;
  readonly members: readonly Member[];
  readonly jointAccount: Account;
}

export async function createHouseholdFixture(
  database: Database,
  name: string,
  memberCount: number,
): Promise<HouseholdFixture> {
  const households = new HouseholdsRepository(database);
  const household = await households.createHousehold({ name, currency: 'EUR' });
  const members: Member[] = [];
  for (let position = 1; position <= memberCount; position += 1) {
    members.push(await households.addMember(household.id, `${name} Member ${String(position)}`));
  }
  const jointAccount = await new AccountsRepository(database).create(household.id, {
    name: 'Joint Account',
    type: 'BANK',
    currency: 'EUR',
  });
  return { household, members, jointAccount };
}

export function memberAt(fixture: HouseholdFixture, position: number): Member {
  const member = fixture.members[position];
  if (member === undefined) {
    throw new Error(`The fixture has no member at position ${String(position)}`);
  }
  return member;
}
