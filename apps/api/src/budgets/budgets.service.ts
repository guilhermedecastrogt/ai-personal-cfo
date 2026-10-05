import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { householdCurrencies } from '../accounts/household-currencies.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { isUniqueViolation } from '../database/unique-violation.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { BudgetsRepository, type Budget, type BudgetChanges } from './budgets.repository.js';

export type { Budget };

export type BudgetInput = BudgetChanges;

export type BudgetRejectionReason =
  | 'UNKNOWN_CATEGORY'
  | 'CATEGORY_KIND_MISMATCH'
  | 'UNSUPPORTED_CURRENCY'
  | 'ENDS_BEFORE_START'
  | 'DUPLICATE_BUDGET';

export class BudgetRejectedError extends Error {
  constructor(readonly reasons: readonly BudgetRejectionReason[]) {
    super(`Budget rejected: ${reasons.join(', ')}`);
    this.name = BudgetRejectedError.name;
  }
}

export type BudgetEditOutcome =
  | { readonly status: 'UPDATED'; readonly budget: Budget }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'STALE' };

@Injectable()
export class BudgetsService {
  constructor(
    private readonly budgets: BudgetsRepository,
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
  ) {}

  async find(householdId: string, budgetId: string): Promise<Budget | undefined> {
    return this.budgets.findById(householdId, budgetId);
  }

  async create(householdId: string, input: BudgetInput): Promise<Budget> {
    await this.validate(householdId, input);
    try {
      return await this.budgets.create(householdId, input);
    } catch (error) {
      throw isUniqueViolation(error) ? new BudgetRejectedError(['DUPLICATE_BUDGET']) : error;
    }
  }

  async edit(
    householdId: string,
    budgetId: string,
    version: string,
    input: BudgetInput,
  ): Promise<BudgetEditOutcome> {
    const existing = await this.budgets.findById(householdId, budgetId);
    if (existing === undefined) {
      return { status: 'NOT_FOUND' };
    }
    if (existing.updatedAt.toISOString() !== version) {
      return { status: 'STALE' };
    }
    await this.validate(householdId, input);
    let updated: Budget | undefined;
    try {
      updated = await this.budgets.update(householdId, budgetId, version, input);
    } catch (error) {
      throw isUniqueViolation(error) ? new BudgetRejectedError(['DUPLICATE_BUDGET']) : error;
    }
    if (updated !== undefined) {
      return { status: 'UPDATED', budget: updated };
    }
    return (await this.budgets.findById(householdId, budgetId)) === undefined
      ? { status: 'NOT_FOUND' }
      : { status: 'STALE' };
  }

  async remove(householdId: string, budgetId: string): Promise<boolean> {
    return this.budgets.delete(householdId, budgetId);
  }

  private async validate(householdId: string, input: BudgetInput): Promise<void> {
    const [household, accounts, category] = await Promise.all([
      this.households.findHousehold(householdId),
      this.accounts.list(householdId),
      input.categoryId === null ? undefined : this.categories.findById(input.categoryId),
    ]);
    const reasons: BudgetRejectionReason[] = [];
    if (input.categoryId !== null && category === undefined) {
      reasons.push('UNKNOWN_CATEGORY');
    }
    if (category !== undefined && category.kind !== 'EXPENSE') {
      reasons.push('CATEGORY_KIND_MISMATCH');
    }
    if (!householdCurrencies(household?.currency, accounts).includes(input.currency)) {
      reasons.push('UNSUPPORTED_CURRENCY');
    }
    if (input.endsOn !== null && input.endsOn < input.startsOn) {
      reasons.push('ENDS_BEFORE_START');
    }
    if (reasons.length > 0) {
      throw new BudgetRejectedError(reasons);
    }
  }
}
