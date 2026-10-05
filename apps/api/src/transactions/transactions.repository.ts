import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import type { NewTransaction } from './new-transaction.schema.js';
import { transactions } from './transactions.schema.js';

export type Transaction = typeof transactions.$inferSelect;

export interface TransactionFilter {
  readonly memberId?: string;
  readonly type?: Transaction['type'];
}

@Injectable()
export class TransactionsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(householdId: string, transaction: NewTransaction): Promise<Transaction> {
    return requireRow(
      await this.database
        .insert(transactions)
        .values({ ...transaction, householdId })
        .returning(),
    );
  }

  async list(householdId: string, filter: TransactionFilter = {}): Promise<Transaction[]> {
    const conditions: SQL[] = [eq(transactions.householdId, householdId)];
    if (filter.memberId !== undefined) {
      conditions.push(eq(transactions.memberId, filter.memberId));
    }
    if (filter.type !== undefined) {
      conditions.push(eq(transactions.type, filter.type));
    }
    return this.database
      .select()
      .from(transactions)
      .where(and(...conditions))
      .orderBy(desc(transactions.transactionDate), desc(transactions.createdAt));
  }
}
