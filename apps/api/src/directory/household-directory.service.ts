import { Injectable } from '@nestjs/common';
import { AccountsRepository, type Account } from '../accounts/accounts.repository.js';
import { CategoriesRepository, type Category } from '../categories/categories.repository.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { HouseholdsRepository } from '../households/households.repository.js';

export type { Account, Category };

export interface NamedEntry {
  readonly id: string;
  readonly name: string;
}

export interface HouseholdDirectory {
  readonly members: readonly NamedEntry[];
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly goals: readonly NamedEntry[];
}

@Injectable()
export class HouseholdDirectoryService {
  constructor(
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly goals: GoalsRepository,
  ) {}

  async load(householdId: string): Promise<HouseholdDirectory> {
    const [members, accounts, categories, goals] = await Promise.all([
      this.households.listMembers(householdId),
      this.accounts.list(householdId),
      this.categories.list(),
      this.goals.list(householdId),
    ]);
    return { members, accounts, categories, goals };
  }

  async defaultAccount(householdId: string, memberId: string): Promise<Account | undefined> {
    return this.accounts.findDefaultAccount(householdId, memberId);
  }
}
