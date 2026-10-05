import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import { requireRow } from '../database/require-row.js';
import { goals } from './goals.schema.js';

export type Goal = typeof goals.$inferSelect;

export interface NewGoal {
  readonly name: string;
  readonly type: Goal['type'];
  readonly targetAmountMinor: number;
  readonly currentAmountMinor?: number;
  readonly currency: string;
  readonly targetDate?: string | null;
}

export interface GoalChanges {
  readonly name: string;
  readonly type: Goal['type'];
  readonly targetAmountMinor: number;
  readonly currentAmountMinor: number;
  readonly currency: string;
  readonly targetDate: string | null;
}

@Injectable()
export class GoalsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(householdId: string, goal: NewGoal): Promise<Goal> {
    return requireRow(
      await this.database
        .insert(goals)
        .values({ ...goal, householdId })
        .returning(),
    );
  }

  async list(householdId: string): Promise<Goal[]> {
    return this.database
      .select()
      .from(goals)
      .where(eq(goals.householdId, householdId))
      .orderBy(asc(goals.createdAt), asc(goals.id));
  }

  async findById(householdId: string, goalId: string): Promise<Goal | undefined> {
    const [goal] = await this.database
      .select()
      .from(goals)
      .where(and(eq(goals.householdId, householdId), eq(goals.id, goalId)));
    return goal;
  }

  async update(
    householdId: string,
    goalId: string,
    version: string,
    changes: GoalChanges,
  ): Promise<Goal | undefined> {
    const [goal] = await this.database
      .update(goals)
      .set(changes)
      .where(
        and(
          eq(goals.householdId, householdId),
          eq(goals.id, goalId),
          sql`date_trunc('milliseconds', ${goals.updatedAt}) = ${version}::timestamptz`,
        ),
      )
      .returning();
    return goal;
  }

  async delete(householdId: string, goalId: string): Promise<boolean> {
    const deleted = await this.database
      .delete(goals)
      .where(and(eq(goals.householdId, householdId), eq(goals.id, goalId)))
      .returning({ id: goals.id });
    return deleted.length > 0;
  }
}
