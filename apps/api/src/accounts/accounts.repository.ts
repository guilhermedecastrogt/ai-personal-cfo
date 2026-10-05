import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { accounts } from './accounts.schema.js';

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

  async findById(householdId: string, accountId: string): Promise<Account | undefined> {
    const [account] = await this.database
      .select()
      .from(accounts)
      .where(and(eq(accounts.householdId, householdId), eq(accounts.id, accountId)));
    return account;
  }
}
