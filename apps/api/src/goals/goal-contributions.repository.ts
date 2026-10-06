import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import { DATABASE, type Database } from '../database/database.js';
import type { DatabaseExecutor } from '../database/database-executor.js';
import { requireRow } from '../database/require-row.js';
import { goalContributions } from './goal-contributions.schema.js';
import { goals } from './goals.schema.js';

export type GoalContribution = typeof goalContributions.$inferSelect;

export interface NewGoalContribution {
  readonly goalId: string;
  readonly memberId: string;
  readonly transactionId: string | null;
  readonly amountMinor: number;
  readonly currency: string;
  readonly contributionDate: string;
}

@Injectable()
export class GoalContributionsRepository {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async add(householdId: string, contribution: NewGoalContribution): Promise<GoalContribution> {
    return this.database.transaction(async (executor) => {
      const added = requireRow(
        await executor
          .insert(goalContributions)
          .values({ ...contribution, householdId })
          .returning(),
      );
      await executor
        .update(goals)
        .set({
          currentAmountMinor: sql`${goals.currentAmountMinor} + ${contribution.amountMinor}`,
        })
        .where(
          and(
            eq(goals.householdId, householdId),
            eq(goals.id, contribution.goalId),
            eq(goals.currency, contribution.currency),
          ),
        );
      return added;
    });
  }

  async countForGoal(householdId: string, goalId: string): Promise<number> {
    return this.database.$count(
      goalContributions,
      and(eq(goalContributions.householdId, householdId), eq(goalContributions.goalId, goalId)),
    );
  }

  async linkedTo(
    householdId: string,
    transactionId: string,
    executor: DatabaseExecutor = this.database,
  ): Promise<GoalContribution | undefined> {
    const [contribution] = await executor
      .select()
      .from(goalContributions)
      .where(
        and(
          eq(goalContributions.householdId, householdId),
          eq(goalContributions.transactionId, transactionId),
        ),
      );
    return contribution;
  }

  async revertForTransaction(
    executor: DatabaseExecutor,
    householdId: string,
    transactionId: string,
  ): Promise<void> {
    const removed = await executor
      .delete(goalContributions)
      .where(
        and(
          eq(goalContributions.householdId, householdId),
          eq(goalContributions.transactionId, transactionId),
        ),
      )
      .returning();
    for (const contribution of removed) {
      await executor
        .update(goals)
        .set({
          currentAmountMinor: sql`greatest(${goals.currentAmountMinor} - ${contribution.amountMinor}, 0)`,
        })
        .where(and(eq(goals.householdId, householdId), eq(goals.id, contribution.goalId)));
    }
  }

  async followTransactionAmount(
    executor: DatabaseExecutor,
    householdId: string,
    transactionId: string,
    amountMinor: number,
  ): Promise<void> {
    const contribution = await this.linkedTo(householdId, transactionId, executor);
    if (contribution === undefined || contribution.amountMinor === amountMinor) {
      return;
    }
    await executor
      .update(goalContributions)
      .set({ amountMinor })
      .where(eq(goalContributions.id, contribution.id));
    await executor
      .update(goals)
      .set({
        currentAmountMinor: sql`greatest(${goals.currentAmountMinor} - ${contribution.amountMinor} + ${amountMinor}, 0)`,
      })
      .where(and(eq(goals.householdId, householdId), eq(goals.id, contribution.goalId)));
  }
}
