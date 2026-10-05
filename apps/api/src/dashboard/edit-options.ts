import { householdCurrencies } from '../accounts/household-currencies.js';
import { BUDGET_PERIODS } from '../budgets/budget-vocabulary.js';
import type { HouseholdDirectory } from '../directory/household-directory.service.js';
import { GOAL_TYPES } from '../goals/goal-vocabulary.js';
import type { BudgetOptions, GoalOptions, TransactionEditView } from './dashboard.contracts.js';

const CATEGORY_PATH_SEPARATOR = ' › ';

interface CategoryOption {
  readonly key: string;
  readonly name: string;
  readonly kind: 'EXPENSE' | 'INCOME';
}

export function categoryOptions(directory: HouseholdDirectory): CategoryOption[] {
  const names = new Map(directory.categories.map((category) => [category.id, category.name]));
  return directory.categories
    .map((category) => {
      const parent = category.parentId === null ? undefined : names.get(category.parentId);
      return {
        key: category.id,
        name:
          parent === undefined
            ? category.name
            : `${parent}${CATEGORY_PATH_SEPARATOR}${category.name}`,
        kind: category.kind,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, directory.locale));
}

export function currencyOptions(
  directory: HouseholdDirectory,
  householdCurrency: string | undefined,
): string[] {
  return householdCurrencies(householdCurrency, directory.accounts);
}

export function budgetOptions(
  directory: HouseholdDirectory,
  householdCurrency: string,
  defaultStartsOn: string,
): BudgetOptions {
  return {
    categories: categoryOptions(directory)
      .filter((category) => category.kind === 'EXPENSE')
      .map(({ key, name }) => ({ key, name })),
    currencies: currencyOptions(directory, householdCurrency),
    periods: [...BUDGET_PERIODS],
    defaultCurrency: householdCurrency,
    defaultStartsOn,
  };
}

export function goalOptions(directory: HouseholdDirectory, householdCurrency: string): GoalOptions {
  return {
    types: [...GOAL_TYPES],
    currencies: currencyOptions(directory, householdCurrency),
    defaultCurrency: householdCurrency,
  };
}

export function transactionOptions(directory: HouseholdDirectory): TransactionEditView['options'] {
  return {
    members: directory.members.map((member) => ({ key: member.id, name: member.name })),
    accounts: directory.accounts.map((account) => ({
      key: account.id,
      name: account.name,
      currency: account.currency,
    })),
    categories: categoryOptions(directory),
  };
}
