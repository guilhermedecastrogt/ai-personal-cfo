import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import type { DatabaseExecutor } from '../database/database-executor.js';
import { requireRow } from '../database/require-row.js';
import type { NewTransaction } from './new-transaction.schema.js';
import { transactions } from './transactions.schema.js';
import type { TransactionSort } from './transaction-vocabulary.js';

export type Transaction = typeof transactions.$inferSelect;

function orderOf(sort: TransactionSort): SQL[] {
  switch (sort) {
    case 'date_asc':
      return [asc(transactions.transactionDate), asc(transactions.createdAt), asc(transactions.id)];
    case 'amount_desc':
      return [
        desc(transactions.amountMinor),
        desc(transactions.transactionDate),
        desc(transactions.id),
      ];
    case 'amount_asc':
      return [
        asc(transactions.amountMinor),
        desc(transactions.transactionDate),
        desc(transactions.id),
      ];
    case 'date_desc':
      return [
        desc(transactions.transactionDate),
        desc(transactions.createdAt),
        desc(transactions.id),
      ];
  }
}

function noHook(): Promise<void> {
  return Promise.resolve();
}

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
  readonly text?: string | undefined;
  readonly sort?: TransactionSort | undefined;
  readonly limit: number;
  readonly offset: number;
}

function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export interface TransactionChanges {
  readonly memberId: string;
  readonly accountId: string;
  readonly type: Transaction['type'];
  readonly amountMinor: number;
  readonly currency: string;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly categoryId: string | null;
  readonly expenseScope: Transaction['expenseScope'];
  readonly transactionDate: string;
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

  async createMany(
    householdId: string,
    batch: readonly NewTransaction[],
    instant: Date,
  ): Promise<Transaction[]> {
    if (batch.length === 0) {
      return [];
    }
    const rows = await this.database
      .insert(transactions)
      .values(
        batch.map((transaction, position) => ({
          ...transaction,
          householdId,
          createdAt: new Date(instant.getTime() + position),
          updatedAt: new Date(instant.getTime() + position),
        })),
      )
      .returning();
    return rows.sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  }

  async findBySourceMessages(
    householdId: string,
    sourceMessageIds: readonly string[],
    limit: number,
  ): Promise<Transaction[]> {
    if (sourceMessageIds.length === 0) {
      return [];
    }
    return this.database
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.householdId, householdId),
          inArray(transactions.sourceMessageId, [...sourceMessageIds]),
        ),
      )
      .orderBy(desc(transactions.createdAt), desc(transactions.id))
      .limit(limit);
  }

  async findById(householdId: string, transactionId: string): Promise<Transaction | undefined> {
    const [transaction] = await this.database
      .select()
      .from(transactions)
      .where(and(eq(transactions.householdId, householdId), eq(transactions.id, transactionId)));
    return transaction;
  }

  async update(
    householdId: string,
    transactionId: string,
    version: string,
    changes: TransactionChanges,
    afterUpdate: (executor: DatabaseExecutor, updated: Transaction) => Promise<void> = noHook,
  ): Promise<Transaction | undefined> {
    return this.database.transaction(async (executor) => {
      const [transaction] = await executor
        .update(transactions)
        .set(changes)
        .where(
          and(
            eq(transactions.householdId, householdId),
            eq(transactions.id, transactionId),
            sql`date_trunc('milliseconds', ${transactions.updatedAt}) = ${version}::timestamptz`,
          ),
        )
        .returning();
      if (transaction !== undefined) {
        await afterUpdate(executor, transaction);
      }
      return transaction;
    });
  }

  async delete(
    householdId: string,
    transactionId: string,
    beforeDelete: (executor: DatabaseExecutor) => Promise<void> = noHook,
  ): Promise<boolean> {
    return this.database.transaction(async (executor) => {
      await beforeDelete(executor);
      const deleted = await executor
        .delete(transactions)
        .where(and(eq(transactions.householdId, householdId), eq(transactions.id, transactionId)))
        .returning({ id: transactions.id });
      return deleted.length > 0;
    });
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
    const text = search.text?.trim() ?? '';
    if (text !== '') {
      const pattern = `%${escapeLike(text)}%`;
      const matching = or(
        ilike(transactions.merchant, pattern),
        ilike(transactions.description, pattern),
      );
      if (matching !== undefined) {
        conditions.push(matching);
      }
    }
    const where = and(...conditions);
    const [total, rows] = await Promise.all([
      this.database.$count(transactions, where),
      this.database
        .select()
        .from(transactions)
        .where(where)
        .orderBy(...orderOf(search.sort ?? 'date_desc'))
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
