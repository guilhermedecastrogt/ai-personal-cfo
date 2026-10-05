import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { accounts, memberDefaultAccounts } from './accounts.schema.js';

export type Account = typeof accounts.$inferSelect;

export interface NewAccount {
  readonly name: string;
  readonly type: Account['type'];
  readonly currency: string;
  readonly ownerMemberId?: string;
  readonly openingBalanceMinor?: number;
}

@Injectable()
export class AccountsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(householdId: string, account: NewAccount): Promise<Account> {
    return requireRow(
      await this.database
        .insert(accounts)
        .values({ ...account, householdId })
        .returning(),
    );
  }

  async list(householdId: string): Promise<Account[]> {
    return this.database
      .select()
      .from(accounts)
      .where(eq(accounts.householdId, householdId))
      .orderBy(asc(accounts.name));
  }

  async setDefaultAccount(householdId: string, memberId: string, accountId: string): Promise<void> {
    await this.database
      .insert(memberDefaultAccounts)
      .values({ householdId, memberId, accountId })
      .onConflictDoUpdate({ target: memberDefaultAccounts.memberId, set: { accountId } });
  }

  async findDefaultAccount(householdId: string, memberId: string): Promise<Account | undefined> {
    const [row] = await this.database
      .select({ account: accounts })
      .from(memberDefaultAccounts)
      .innerJoin(accounts, eq(accounts.id, memberDefaultAccounts.accountId))
      .where(
        and(
          eq(memberDefaultAccounts.householdId, householdId),
          eq(memberDefaultAccounts.memberId, memberId),
        ),
      );
    return row?.account;
  }

  async findById(householdId: string, accountId: string): Promise<Account | undefined> {
    const [account] = await this.database
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.id, accountId)));
    return account;
  }
}
