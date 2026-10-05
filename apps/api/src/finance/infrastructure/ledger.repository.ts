import { Inject, Injectable } from '@nestjs/common';
import { and, asc, between, eq, type SQL } from 'drizzle-orm';
import { DATABASE, type Database } from '../../database/database.js';
import { transactions } from '../../transactions/transactions.schema.js';
import type { LedgerEntry } from '../domain/ledger/ledger-entry.js';
import type { DateRange } from '../domain/period/period.js';

export interface LedgerQuery {
  readonly currency?: string;
  readonly period?: DateRange;
}

@Injectable()
export class LedgerRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async findEntries(householdId: string, query: LedgerQuery = {}): Promise<LedgerEntry[]> {
    const conditions: SQL[] = [eq(transactions.householdId, householdId)];
    if (query.currency !== undefined) {
      conditions.push(eq(transactions.currency, query.currency));
    }
    if (query.period !== undefined) {
      conditions.push(between(transactions.transactionDate, query.period.start, query.period.end));
    }
    return this.database
      .select({
        id: transactions.id,
        type: transactions.type,
        amountMinor: transactions.amountMinor,
        currency: transactions.currency,
        date: transactions.transactionDate,
        memberId: transactions.memberId,
        accountId: transactions.accountId,
        transferAccountId: transactions.transferAccountId,
        categoryId: transactions.categoryId,
        merchant: transactions.merchant,
      })
      .from(transactions)
      .where(and(...conditions))
      .orderBy(asc(transactions.transactionDate), asc(transactions.id));
  }
}
