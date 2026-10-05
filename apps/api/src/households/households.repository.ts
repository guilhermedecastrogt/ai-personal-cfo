import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
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
