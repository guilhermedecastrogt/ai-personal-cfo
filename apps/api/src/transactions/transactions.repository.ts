import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, desc, eq, inArray, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import type { NewTransaction } from './new-transaction.schema.js';
import { transactions } from './transactions.schema.js';

export type Transaction = typeof transactions.$inferSelect;

export interface TransactionFilter {
  readonly memberId?: string;
  readonly type?: Transaction['type'];
}

export interface TransactionSearch {
  readonly period: { readonly start: string; readonly end: string };
  readonly type?: Transaction['type'] | undefined;
  readonly memberId?: string | undefined;
  readonly accountId?: string | undefined;
  readonly categoryIds?: readonly string[] | undefined;
  readonly limit: number;
  readonly offset: number;
}

export interface TransactionPage {
  readonly total: number;
  readonly transactions: readonly Transaction[];
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

  async findBySourceMessage(
    householdId: string,
    sourceMessageId: string,
  ): Promise<Transaction | undefined> {
    const [transaction] = await this.database
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          eq(transactions.sourceMessageId, sourceMessageId),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(1);
    return transaction;
  }

  async search(householdId: string, search: TransactionSearch): Promise<TransactionPage> {
    const conditions: SQL[] = [
      eq(transactions.householdId, householdId),
      between(transactions.transactionDate, search.period.start, search.period.end),
    ];
    if (search.type !== undefined) {
      conditions.push(eq(transactions.type, search.type));
    }
    if (search.memberId !== undefined) {
      conditions.push(eq(transactions.memberId, search.memberId));
    }
    if (search.accountId !== undefined) {
      conditions.push(eq(transactions.accountId, search.accountId));
    }
    if (search.categoryIds !== undefined) {
      conditions.push(inArray(transactions.categoryId, [...search.categoryIds]));
    }
    const where = and(...conditions);
    const [total, rows] = await Promise.all([
      this.database.$count(transactions, where),
      this.database
        .select()
        .from(transactions)
        .where(where)
        .orderBy(
          desc(transactions.transactionDate),
          desc(transactions.createdAt),
          desc(transactions.id),
        )
        .limit(search.limit)
        .offset(search.offset),
    ]);
    return { total, transactions: rows };
  }

  async earliestDate(householdId: string): Promise<string | undefined> {
    const [earliest] = await this.database
      .select({ date: transactions.transactionDate })
      .from(transactions)
      .where(eq(transactions.householdId, householdId))
      .orderBy(asc(transactions.transactionDate))
      .limit(1);
    return earliest?.date;
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
