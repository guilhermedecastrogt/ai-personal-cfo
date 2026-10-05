import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { createHouseholdFixture, memberAt } from './support/household-fixture.js';
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

describe('accounts', () => {
  let testDatabase: TestDatabase;
  let repository: AccountsRepository;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    repository = new AccountsRepository(testDatabase.database);
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  it('holds one individual account per member alongside joint accounts', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Ownership', 4);
    for (const member of fixture.members) {
      await repository.create(fixture.household.id, {
        name: `${member.name} Current`,
        type: 'BANK',
        currency: 'EUR',
        ownerMemberId: member.id,
      });
    }
    await repository.create(fixture.household.id, {
      name: 'Joint Savings',
      type: 'SAVINGS',
      currency: 'EUR',
    });

    const listed = await repository.list(fixture.household.id);
    const owners = listed.map((account) => account.ownerMemberId);

    expect(listed).toHaveLength(6);
    expect(owners.filter((owner) => owner === null)).toHaveLength(2);
    expect(new Set(owners.filter((owner) => owner !== null))).toEqual(
      new Set(fixture.members.map((member) => member.id)),
    );
  });

  it('lets one member own several accounts', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Several Accounts', 1);
    const owner = memberAt(fixture, 0);
    for (const name of ['Current', 'Credit Card', 'Cash']) {
      await repository.create(fixture.household.id, {
        name,
        type: 'BANK',
        currency: 'EUR',
        ownerMemberId: owner.id,
      });
    }

    const owned = (await repository.list(fixture.household.id)).filter(
      (account) => account.ownerMemberId === owner.id,
    );

    expect(owned).toHaveLength(3);
  });

  it('rejects an owner who belongs to another household', async () => {
    const first = await createHouseholdFixture(testDatabase.database, 'Owner First', 1);
    const second = await createHouseholdFixture(testDatabase.database, 'Owner Second', 1);

    const constraint = await violatedConstraint(
      repository.create(first.household.id, {
        name: 'Borrowed Owner',
        type: 'BANK',
        currency: 'EUR',
        ownerMemberId: memberAt(second, 0).id,
      }),
    );

    expect(constraint).toBe('accounts_owner_member_fk');
  });

  it('does not list or find the accounts of another household', async () => {
    const first = await createHouseholdFixture(testDatabase.database, 'Scope First', 1);
    const second = await createHouseholdFixture(testDatabase.database, 'Scope Second', 1);

    const listed = await repository.list(first.household.id);

    expect(listed.map((account) => account.id)).toEqual([first.jointAccount.id]);
    expect(await repository.findById(first.household.id, second.jointAccount.id)).toBeUndefined();
  });

  it('allows the same account name in different households but not within one', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Names', 1);

    const constraint = await violatedConstraint(
      repository.create(fixture.household.id, {
        name: fixture.jointAccount.name,
        type: 'BANK',
        currency: 'EUR',
      }),
    );

    expect(constraint).toBe('accounts_household_id_name_unique');
  });

  it('keeps the opening balance as integer minor units', async () => {
    const fixture = await createHouseholdFixture(testDatabase.database, 'Balance', 1);

    const account = await repository.create(fixture.household.id, {
      name: 'Overdrawn',
      type: 'BANK',
      currency: 'EUR',
      openingBalanceMinor: -4327,
    });

    expect(account.openingBalanceMinor).toBe(-4327);
  });
});
