import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { budgets } from './budgets.schema.js';

export type Budget = typeof budgets.$inferSelect;

export interface NewBudget {
  readonly categoryId?: string | null;
  readonly period: Budget['period'];
  readonly limitMinor: number;
  readonly currency: string;
  readonly alertThresholdPercent?: number;
  readonly startsOn: string;
  readonly endsOn?: string | null;
}

export interface BudgetChanges {
  readonly categoryId: string | null;
  readonly period: Budget['period'];
  readonly limitMinor: number;
  readonly currency: string;
  readonly alertThresholdPercent: number;
  readonly startsOn: string;
  readonly endsOn: string | null;
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

  async findById(householdId: string, budgetId: string): Promise<Budget | undefined> {
    const [budget] = await this.database
      .select()
      .from(budgets)
      .where(and(eq(budgets.householdId, householdId), eq(budgets.id, budgetId)));
    return budget;
  }

  async update(
    householdId: string,
    budgetId: string,
    version: string,
    changes: BudgetChanges,
  ): Promise<Budget | undefined> {
    const [budget] = await this.database
      .update(budgets)
      .set(changes)
      .where(
        and(
          eq(budgets.householdId, householdId),
          eq(budgets.id, budgetId),
          sql`date_trunc('milliseconds', ${budgets.updatedAt}) = ${version}::timestamptz`,
        ),
      )
      .returning();
    return budget;
  }

  async delete(householdId: string, budgetId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(budgets)
      .where(and(eq(budgets.householdId, householdId), eq(budgets.id, budgetId)))
      .returning({ id: budgets.id });
    return deleted.length > 0;
  }
}
