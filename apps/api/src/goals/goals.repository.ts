import { Inject, Injectable } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
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
  readonly targetDate?: string;
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
}
