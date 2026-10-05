import { Injectable } from '@nestjs/common';
import { AccountsRepository, type Account } from '../accounts/accounts.repository.js';
import { CategoriesRepository, type Category } from '../categories/categories.repository.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { categoryLabel } from '../i18n/category-labels.js';
import { localeOr, type Locale } from '../i18n/locale.js';

export type { Account, Category };

export interface NamedEntry {
  readonly id: string;
  readonly name: string;
}

export interface HouseholdProfile {
  readonly name: string;
  readonly currency: string;
  readonly timezone: string;
  readonly locale: Locale;
}

export interface HouseholdDirectory {
  readonly members: readonly NamedEntry[];
  readonly accounts: readonly Account[];
  readonly categories: readonly Category[];
  readonly goals: readonly NamedEntry[];
  readonly locale: Locale;
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
    const [household, members, accounts, categories, goals] = await Promise.all([
      this.households.findHousehold(householdId),
      this.households.listMembers(householdId),
      this.accounts.list(householdId),
      this.categories.list(),
      this.goals.list(householdId),
    ]);
    const locale = localeOr(household?.locale);
    return {
      members,
      accounts,
      categories: categories.map((category) => ({
        ...category,
        name: categoryLabel(category.name, locale),
      })),
      goals,
      locale,
    };
  }

  async profile(householdId: string): Promise<HouseholdProfile | undefined> {
    const household = await this.households.findHousehold(householdId);
    return household === undefined
      ? undefined
      : {
          name: household.name,
          currency: household.currency,
          timezone: household.timezone,
          locale: localeOr(household.locale),
        };
  }

  async defaultAccount(householdId: string, memberId: string): Promise<Account | undefined> {
    return this.accounts.findDefaultAccount(householdId, memberId);
  }
}
