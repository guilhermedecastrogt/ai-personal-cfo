import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { households, members, whatsappIdentities } from './households.schema.js';

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type WhatsAppIdentity = typeof whatsappIdentities.$inferSelect;

export interface NewHousehold {
  readonly name: string;
  readonly currency: string;
  readonly timezone?: string;
  readonly locale?: string;
}

export interface HouseholdSettings {
  readonly name: string;
  readonly timezone: string;
  readonly locale: string;
}

export interface NewWhatsAppIdentity {
  readonly memberId: string;
  readonly provider: string;
  readonly externalUserId: string;
  readonly phoneNumber: string;
}

export class MemberNotInHouseholdError extends Error {
  constructor() {
    super('Member does not belong to the household');
    this.name = MemberNotInHouseholdError.name;
  }
}

@Injectable()
export class HouseholdsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async createHousehold(household: NewHousehold): Promise<Household> {
    return requireRow(await this.database.insert(households).values(household).returning());
  }

  async createHouseholdWithMembers(
    household: NewHousehold,
    memberNames: readonly string[],
  ): Promise<Household> {
    return this.database.transaction(async (transaction) => {
      const created = requireRow(
        await transaction.insert(households).values(household).returning(),
      );
      for (const name of memberNames) {
        await transaction.insert(members).values({ householdId: created.id, name });
      }
      return created;
    });
  }

  async findHousehold(householdId: string): Promise<Household | undefined> {
    const [household] = await this.database
      .select()
      .from(households)
      .where(eq(households.id, householdId));
    return household;
  }

  async addMember(householdId: string, name: string): Promise<Member> {
    return requireRow(
      await this.database.insert(members).values({ householdId, name }).returning(),
    );
  }

  async listMembers(householdId: string): Promise<Member[]> {
    return this.database
      .select()
      .from(members)
      .where(eq(members.householdId, householdId))
      .orderBy(asc(members.createdAt), asc(members.id));
  }

  async findMember(householdId: string, memberId: string): Promise<Member | undefined> {
    const [member] = await this.database
      .select()
      .from(members)
      .where(and(eq(members.householdId, householdId), eq(members.id, memberId)));
    return member;
  }

  async listHouseholds(): Promise<Household[]> {
    return this.database.select().from(households).orderBy(asc(households.createdAt));
  }

  async updateHousehold(
    householdId: string,
    settings: HouseholdSettings,
  ): Promise<Household | undefined> {
    const [updated] = await this.database
      .update(households)
      .set({ ...settings, updatedAt: new Date() })
      .where(eq(households.id, householdId))
      .returning();
    return updated;
  }

  async countMembersByHousehold(): Promise<Map<string, number>> {
    const rows = await this.database
      .select({ householdId: members.householdId, count: count() })
      .from(members)
      .groupBy(members.householdId);
    return new Map(rows.map((row) => [row.householdId, row.count]));
  }

  async listWhatsAppIdentities(householdId: string): Promise<WhatsAppIdentity[]> {
    return this.database
      .select({
        id: whatsappIdentities.id,
        memberId: whatsappIdentities.memberId,
        provider: whatsappIdentities.provider,
        externalUserId: whatsappIdentities.externalUserId,
        phoneNumber: whatsappIdentities.phoneNumber,
        createdAt: whatsappIdentities.createdAt,
      })
      .from(whatsappIdentities)
      .innerJoin(members, eq(members.id, whatsappIdentities.memberId))
      .where(eq(members.householdId, householdId))
      .orderBy(asc(whatsappIdentities.createdAt), asc(whatsappIdentities.id));
  }

  async removeWhatsAppIdentity(householdId: string, identityId: string): Promise<boolean> {
    const owned = this.database
      .select({ id: whatsappIdentities.id })
      .from(whatsappIdentities)
      .innerJoin(members, eq(members.id, whatsappIdentities.memberId))
      .where(and(eq(members.householdId, householdId), eq(whatsappIdentities.id, identityId)));
    const removed = await this.database
      .delete(whatsappIdentities)
      .where(inArray(whatsappIdentities.id, owned))
      .returning({ id: whatsappIdentities.id });
    return removed.length > 0;
  }

  async listWhatsAppAddresses(
    householdId: string,
    provider: string,
  ): Promise<{ memberId: string; memberName: string; address: string }[]> {
    return this.database
      .select({
        memberId: members.id,
        memberName: members.name,
        address: whatsappIdentities.externalUserId,
      })
      .from(whatsappIdentities)
      .innerJoin(members, eq(members.id, whatsappIdentities.memberId))
      .where(and(eq(members.householdId, householdId), eq(whatsappIdentities.provider, provider)))
      .orderBy(asc(members.createdAt), asc(whatsappIdentities.createdAt));
  }

  async isWhatsAppAddressTaken(provider: string, externalUserId: string): Promise<boolean> {
    const [found] = await this.database
      .select({ id: whatsappIdentities.id })
      .from(whatsappIdentities)
      .where(
        and(
          eq(whatsappIdentities.provider, provider),
          eq(whatsappIdentities.externalUserId, externalUserId),
        ),
      );
    return found !== undefined;
  }

  async registerWhatsAppIdentity(
    householdId: string,
    identity: NewWhatsAppIdentity,
  ): Promise<WhatsAppIdentity> {
    if ((await this.findMember(householdId, identity.memberId)) === undefined) {
      throw new MemberNotInHouseholdError();
    }
    return requireRow(await this.database.insert(whatsappIdentities).values(identity).returning());
  }
}
