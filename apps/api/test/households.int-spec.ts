import { randomUUID } from 'node:crypto';
import { households, members, whatsappIdentities } from '../src/households/households.schema.js';
import {
  HouseholdsRepository,
  MemberNotInHouseholdError,
} from '../src/households/households.repository.js';
import { WhatsAppIdentityResolver } from '../src/households/whatsapp-identity-resolver.js';
import { createHouseholdFixture, memberAt } from './support/household-fixture.js';
import {
  createTestDatabase,
  violatedConstraint,
  type TestDatabase,
} from './support/test-database.js';

describe('households and members', () => {
  let testDatabase: TestDatabase;
  let repository: HouseholdsRepository;
  let resolver: WhatsAppIdentityResolver;

  beforeAll(async () => {
    testDatabase = await createTestDatabase();
    repository = new HouseholdsRepository(testDatabase.database);
    resolver = new WhatsAppIdentityResolver(testDatabase.database);
  });

  afterAll(async () => {
    await testDatabase.destroy();
  });

  it.each([1, 2, 3, 7])('supports a household with %d members', async (memberCount) => {
    const fixture = await createHouseholdFixture(
      testDatabase.database,
      `Size ${String(memberCount)}`,
      memberCount,
    );

    const listed = await repository.listMembers(fixture.household.id);

    expect(listed.map((member) => member.id)).toEqual(fixture.members.map((member) => member.id));
  });

  it('keeps the members of different households apart', async () => {
    const first = await createHouseholdFixture(testDatabase.database, 'Isolation First', 3);
    const second = await createHouseholdFixture(testDatabase.database, 'Isolation Second', 2);

    const listed = await repository.listMembers(first.household.id);

    expect(listed).toHaveLength(3);
    expect(listed.every((member) => member.householdId === first.household.id)).toBe(true);
    expect(await repository.findMember(first.household.id, memberAt(second, 0).id)).toBeUndefined();
  });

  it('rejects a member without a household', async () => {
    const constraint = await violatedConstraint(
      testDatabase.database.insert(members).values({ householdId: randomUUID(), name: 'Orphan' }),
    );

    expect(constraint).toBe('members_household_id_households_id_fk');
  });

  it('rejects a blank household name and a malformed currency', async () => {
    expect(
      await violatedConstraint(
        testDatabase.database.insert(households).values({ name: '  ', currency: 'EUR' }),
      ),
    ).toBe('households_name_not_blank');
    expect(
      await violatedConstraint(
        testDatabase.database.insert(households).values({ name: 'Lowercase', currency: 'eur' }),
      ),
    ).toBe('households_currency_format');
  });

  describe('whatsapp identities', () => {
    it('resolves each identity to its own member and household', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Resolution', 3);
      for (const [position, member] of fixture.members.entries()) {
        await repository.registerWhatsAppIdentity(fixture.household.id, {
          memberId: member.id,
          provider: 'kapso',
          externalUserId: `resolution-${String(position)}`,
          phoneNumber: `+1202555020${String(position)}`,
        });
      }

      const contexts = await Promise.all(
        fixture.members.map((_, position) =>
          resolver.resolve('kapso', `resolution-${String(position)}`),
        ),
      );

      expect(contexts).toEqual(
        fixture.members.map((member) => ({
          householdId: fixture.household.id,
          memberId: member.id,
          memberName: member.name,
          channel: 'whatsapp',
        })),
      );
    });

    it('resolves identities of different households to different households', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Tenant First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Tenant Second', 1);
      await repository.registerWhatsAppIdentity(first.household.id, {
        memberId: memberAt(first, 0).id,
        provider: 'kapso',
        externalUserId: 'tenant-first',
        phoneNumber: '+12025550301',
      });
      await repository.registerWhatsAppIdentity(second.household.id, {
        memberId: memberAt(second, 0).id,
        provider: 'kapso',
        externalUserId: 'tenant-second',
        phoneNumber: '+12025550302',
      });

      expect((await resolver.resolve('kapso', 'tenant-first'))?.householdId).toBe(
        first.household.id,
      );
      expect((await resolver.resolve('kapso', 'tenant-second'))?.householdId).toBe(
        second.household.id,
      );
    });

    it('lets one member have several identities', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Two Phones', 1);
      const member = memberAt(fixture, 0);
      for (const externalUserId of ['two-phones-a', 'two-phones-b']) {
        await repository.registerWhatsAppIdentity(fixture.household.id, {
          memberId: member.id,
          provider: 'kapso',
          externalUserId,
          phoneNumber: '+12025550401',
        });
      }

      expect((await resolver.resolve('kapso', 'two-phones-a'))?.memberId).toBe(member.id);
      expect((await resolver.resolve('kapso', 'two-phones-b'))?.memberId).toBe(member.id);
    });

    it('does not resolve an unregistered sender and creates nothing for it', async () => {
      const membersBefore = await testDatabase.database.$count(members);

      expect(await resolver.resolve('kapso', 'never-registered')).toBeUndefined();
      expect(await testDatabase.database.$count(members)).toBe(membersBefore);
    });

    it('does not resolve a known identifier under another provider', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Provider Scope', 1);
      await repository.registerWhatsAppIdentity(fixture.household.id, {
        memberId: memberAt(fixture, 0).id,
        provider: 'kapso',
        externalUserId: 'provider-scope',
        phoneNumber: '+12025550501',
      });

      expect(await resolver.resolve('another-provider', 'provider-scope')).toBeUndefined();
    });

    it('rejects the same external identity for a second member', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Duplicate Identity', 2);
      const identity = {
        provider: 'kapso',
        externalUserId: 'duplicate',
        phoneNumber: '+12025550601',
      };
      await repository.registerWhatsAppIdentity(fixture.household.id, {
        ...identity,
        memberId: memberAt(fixture, 0).id,
      });

      const constraint = await violatedConstraint(
        repository.registerWhatsAppIdentity(fixture.household.id, {
          ...identity,
          memberId: memberAt(fixture, 1).id,
        }),
      );

      expect(constraint).toBe('whatsapp_identities_provider_external_user_id_unique');
    });

    it('refuses to register an identity for a member of another household', async () => {
      const first = await createHouseholdFixture(testDatabase.database, 'Register First', 1);
      const second = await createHouseholdFixture(testDatabase.database, 'Register Second', 1);

      await expect(
        repository.registerWhatsAppIdentity(first.household.id, {
          memberId: memberAt(second, 0).id,
          provider: 'kapso',
          externalUserId: 'cross-household',
          phoneNumber: '+12025550701',
        }),
      ).rejects.toThrow(MemberNotInHouseholdError);
    });

    it('rejects a phone number that is not in E.164 form', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Phone Format', 1);

      const constraint = await violatedConstraint(
        testDatabase.database.insert(whatsappIdentities).values({
          memberId: memberAt(fixture, 0).id,
          provider: 'kapso',
          externalUserId: 'phone-format',
          phoneNumber: '085 123 4567',
        }),
      );

      expect(constraint).toBe('whatsapp_identities_phone_number_e164');
    });
  });
});
