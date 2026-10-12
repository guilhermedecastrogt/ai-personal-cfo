import { householdCurrencies } from '../accounts/household-currencies.js';
import { BUDGET_PERIODS } from '../budgets/budget-vocabulary.js';
import type { HouseholdDirectory } from '../directory/household-directory.service.js';
import { CategoryTree } from '../finance/domain/categories/category-tree.js';
import { GOAL_TYPES } from '../goals/goal-vocabulary.js';
import type { BudgetOptions, GoalOptions, TransactionEditView } from './dashboard.contracts.js';

const CATEGORY_PATH_SEPARATOR = ' › ';

interface CategoryOption {
  readonly key: string;
  readonly name: string;
  readonly kind: 'EXPENSE' | 'INCOME';
}

export function categoryPaths(directory: HouseholdDirectory): Map<string, string> {
  const lineages = categoryLineages(directory);
  return new Map([...lineages].map(([id, names]) => [id, names.join(CATEGORY_PATH_SEPARATOR)]));
}

export function categoryOptions(directory: HouseholdDirectory): CategoryOption[] {
  const lineages = categoryLineages(directory);
  const lineageOf = (id: string): readonly string[] => lineages.get(id) ?? [];
  return directory.categories
    .map((category) => ({
      key: category.id,
      name: lineageOf(category.id).join(CATEGORY_PATH_SEPARATOR),
      kind: category.kind,
    }))
    .sort((left, right) => compareLineages(lineageOf(left.key), lineageOf(right.key), directory));
}

export function categoryFilterOptions(directory: HouseholdDirectory): CategoryOption[] {
  const options = categoryOptions(directory);
  return [
    ...options.filter((option) => option.kind === 'EXPENSE'),
    ...options.filter((option) => option.kind === 'INCOME'),
  ];
}

function categoryLineages(directory: HouseholdDirectory): Map<string, string[]> {
  const tree = new CategoryTree(directory.categories);
  const names = new Map(directory.categories.map((category) => [category.id, category.name]));
  return new Map(
    directory.categories.map((category) => [
      category.id,
      tree
        .lineageOf(category.id)
        .reverse()
        .map((id) => names.get(id) ?? ''),
    ]),
  );
}

function compareLineages(
  left: readonly string[],
  right: readonly string[],
  directory: HouseholdDirectory,
): number {
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const order = (left[index] ?? '').localeCompare(right[index] ?? '', directory.locale);
    if (order !== 0) {
      return order;
    }
  }
  return left.length - right.length;
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
