import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { householdCurrencies } from '../accounts/household-currencies.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import {
  GoalContributionsRepository,
  type NewGoalContribution,
} from './goal-contributions.repository.js';
import { GoalsRepository, type Goal, type GoalChanges } from './goals.repository.js';

export type { Goal };

export type GoalInput = GoalChanges;

export type GoalRejectionReason = 'UNSUPPORTED_CURRENCY' | 'CURRENCY_LOCKED';

export class GoalRejectedError extends Error {
  constructor(readonly reasons: readonly GoalRejectionReason[]) {
    super(`Goal rejected: ${reasons.join(', ')}`);
    this.name = GoalRejectedError.name;
  }
}

export type ContributionOutcome =
  | { readonly status: 'CONTRIBUTED'; readonly goal: Goal }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'CANCELLED' }
  | { readonly status: 'CURRENCY_MISMATCH'; readonly goal: Goal }
  | { readonly status: 'ALREADY_CONTRIBUTED'; readonly goal: Goal };

export type GoalEditOutcome =
  | { readonly status: 'UPDATED'; readonly goal: Goal }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'STALE' };

@Injectable()
export class GoalsService {
  constructor(
    private readonly goals: GoalsRepository,
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly contributions: GoalContributionsRepository,
  ) {}

  async list(householdId: string): Promise<Goal[]> {
    return this.goals.list(householdId);
  }

  async contribute(
    householdId: string,
    contribution: NewGoalContribution,
  ): Promise<ContributionOutcome> {
    const goal = await this.goals.findById(householdId, contribution.goalId);
    if (goal === undefined) {
      return { status: 'NOT_FOUND' };
    }
    if (goal.status === 'CANCELLED') {
      return { status: 'CANCELLED' };
    }
    if (goal.currency !== contribution.currency) {
      return { status: 'CURRENCY_MISMATCH', goal };
    }
    try {
      await this.contributions.add(householdId, contribution);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return { status: 'ALREADY_CONTRIBUTED', goal };
      }
      throw error;
    }
    const updated = await this.goals.findById(householdId, goal.id);
    return { status: 'CONTRIBUTED', goal: updated ?? goal };
  }

  async find(householdId: string, goalId: string): Promise<Goal | undefined> {
    return this.goals.findById(householdId, goalId);
  }

  async create(householdId: string, input: GoalInput): Promise<Goal> {
    await this.validate(householdId, input);
    return this.goals.create(householdId, input);
  }

  async edit(
    householdId: string,
    goalId: string,
    version: string,
    input: GoalInput,
  ): Promise<GoalEditOutcome> {
    const existing = await this.goals.findById(householdId, goalId);
    if (existing === undefined) {
      return { status: 'NOT_FOUND' };
    }
    if (existing.updatedAt.toISOString() !== version) {
      return { status: 'STALE' };
    }
    await this.validate(householdId, input);
    if (
      input.currency !== existing.currency &&
      (await this.contributions.countForGoal(householdId, goalId)) > 0
    ) {
      throw new GoalRejectedError(['CURRENCY_LOCKED']);
    }
    const updated = await this.goals.update(householdId, goalId, version, input);
    if (updated !== undefined) {
      return { status: 'UPDATED', goal: updated };
    }
    return (await this.goals.findById(householdId, goalId)) === undefined
      ? { status: 'NOT_FOUND' }
      : { status: 'STALE' };
  }

  async remove(householdId: string, goalId: string): Promise<boolean> {
    return this.goals.delete(householdId, goalId);
  }

  private async validate(householdId: string, input: GoalInput): Promise<void> {
    const [household, accounts] = await Promise.all([
      this.households.findHousehold(householdId),
      this.accounts.list(householdId),
    ]);
    if (!householdCurrencies(household?.currency, accounts).includes(input.currency)) {
      throw new GoalRejectedError(['UNSUPPORTED_CURRENCY']);
    }
  }
}
