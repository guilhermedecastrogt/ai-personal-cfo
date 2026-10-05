import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { householdCurrencies } from '../accounts/household-currencies.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { GoalsRepository, type Goal, type GoalChanges } from './goals.repository.js';

export type { Goal };

export type GoalInput = GoalChanges;

export type GoalRejectionReason = 'UNSUPPORTED_CURRENCY';

export class GoalRejectedError extends Error {
  constructor(readonly reasons: readonly GoalRejectionReason[]) {
    super(`Goal rejected: ${reasons.join(', ')}`);
    this.name = GoalRejectedError.name;
  }
}

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
  ) {}

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
