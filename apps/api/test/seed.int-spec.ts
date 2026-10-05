import { eq } from 'drizzle-orm';
import { accounts } from '../src/accounts/accounts.schema.js';
import { budgets } from '../src/budgets/budgets.schema.js';
import { demoHousehold } from '../src/database/seed/demo-household.js';
import { seedDefinitionSchema } from '../src/database/seed/seed-definition.js';
import { seedHousehold, UnknownSeedCategoryError } from '../src/database/seed/seed-household.js';
import { goals } from '../src/goals/goals.schema.js';
import { households, members, whatsappIdentities } from '../src/households/households.schema.js';
import { WhatsAppIdentityResolver } from '../src/households/whatsapp-identity-resolver.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

describe('seed', () => {
  let testDatabase: TestDatabase;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  describe('demo household', () => {
    const definition = seedDefinitionSchema.parse(demoHousehold);
    let householdId: string;

    beforeAll(async () => {
      ({ householdId } = await seedHousehold(testDatabase.database, definition));
    });

    it('has three members', async () => {
      const seeded = await testDatabase.database
        .select()
        .from(members)
        .where(eq(members.householdId, householdId));

      expect(seeded.map((member) => member.name).sort()).toEqual([
        'Member A',
        'Member B',
        'Member C',
      ]);
    });

    it('has individual accounts for several members and joint accounts', async () => {
      const seeded = await testDatabase.database
        .select()
        .from(accounts)
        .where(eq(accounts.householdId, householdId));
      const joint = seeded.filter((account) => account.ownerMemberId === null);
      const owners = new Set(seeded.map((account) => account.ownerMemberId).filter(Boolean));

      expect(seeded).toHaveLength(6);
      expect(joint.map((account) => account.name).sort()).toEqual([
        'Joint Account',
        'Joint Savings',
      ]);
      expect(owners.size).toBe(3);
    });

    it('has household budgets and goals', async () => {
      expect(
        await testDatabase.database.$count(budgets, eq(budgets.householdId, householdId)),
      ).toBe(3);
      expect(await testDatabase.database.$count(goals, eq(goals.householdId, householdId))).toBe(2);
    });

    it('makes its registered senders resolvable', async () => {
      const context = await new WhatsAppIdentityResolver(testDatabase.database).resolve(
        'kapso',
        '12025550102',
      );

      expect(context).toMatchObject({ householdId, memberName: 'Member B', channel: 'whatsapp' });
    });

    it('produces the same identifiers and no duplicates when run again', async () => {
      const again = await seedHousehold(testDatabase.database, definition);

      expect(again.householdId).toBe(householdId);
      expect(await testDatabase.database.$count(households, eq(households.id, householdId))).toBe(
        1,
      );
      expect(
        await testDatabase.database.$count(members, eq(members.householdId, householdId)),
      ).toBe(3);
      expect(
        await testDatabase.database.$count(accounts, eq(accounts.householdId, householdId)),
      ).toBe(6);
      expect(
        await testDatabase.database.$count(budgets, eq(budgets.householdId, householdId)),
      ).toBe(3);
      expect(await testDatabase.database.$count(goals, eq(goals.householdId, householdId))).toBe(2);
      expect(await testDatabase.database.$count(whatsappIdentities)).toBe(2);
    });
  });

  it.each([1, 2, 5])('seeds a custom household with %d members', async (memberCount) => {
    const definition = seedDefinitionSchema.parse({
      household: { name: `Custom ${String(memberCount)}`, currency: 'EUR' },
      members: Array.from({ length: memberCount }, (_, index) => ({
        name: `Person ${String(index + 1)}`,
      })),
      accounts: Array.from({ length: memberCount }, (_, index) => ({
        name: `Person ${String(index + 1)} Current`,
        type: 'BANK',
        owner: `Person ${String(index + 1)}`,
      })),
    });

    const { householdId, memberIds } = await seedHousehold(testDatabase.database, definition);

    expect(memberIds.size).toBe(memberCount);
    expect(await testDatabase.database.$count(members, eq(members.householdId, householdId))).toBe(
      memberCount,
    );
    expect(
      await testDatabase.database.$count(accounts, eq(accounts.householdId, householdId)),
    ).toBe(memberCount);
  });

  it('leaves nothing behind when the definition names an unknown category', async () => {
    const definition = seedDefinitionSchema.parse({
      household: { name: 'Rolled Back', currency: 'EUR' },
      members: [{ name: 'Person 1' }],
      budgets: [
        { category: 'Invented', period: 'MONTHLY', limitMinor: 1000, startsOn: '2026-01-01' },
      ],
    });

    await expect(seedHousehold(testDatabase.database, definition)).rejects.toThrow(
      UnknownSeedCategoryError,
    );
    expect(await testDatabase.database.$count(households, eq(households.name, 'Rolled Back'))).toBe(
      0,
    );
  });
});
