import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { budgets } from './budgets.schema.js';

export type Budget = typeof budgets.$inferSelect;

export interface NewBudget {
  readonly categoryId?: string;
  readonly period: Budget['period'];
  readonly limitMinor: number;
  readonly currency: string;
  readonly alertThresholdPercent?: number;
  readonly startsOn: string;
  readonly endsOn?: string;
}

@Injectable()
export class BudgetsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(householdId: string, budget: NewBudget): Promise<Budget> {
    return requireRow(
      await this.database
        .insert(budgets)
        .values({ ...budget, householdId })
        .returning(),
    );
  }

  async list(householdId: string): Promise<Budget[]> {
    return this.database
      .select()
      .from(budgets)
      .where(eq(budgets.householdId, householdId))
      .orderBy(asc(budgets.startsOn), asc(budgets.createdAt));
  }
}
