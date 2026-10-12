import type { Category, HouseholdDirectory } from '../directory/household-directory.service.js';
import { categoryFilterOptions, categoryOptions, categoryPaths } from './edit-options.js';

const CREATED = new Date('2026-01-01T00:00:00Z');

const category = (
  id: string,
  name: string,
  parentId: string | null,
  kind: Category['kind'] = 'EXPENSE',
): Category => ({ id, name, parentId, kind, createdAt: CREATED, updatedAt: CREATED });

const DIRECTORY: HouseholdDirectory = {
  members: [],
  accounts: [],
  goals: [],
  locale: 'pt-BR',
  categories: [
    category('salary', 'Salário', null, 'INCOME'),
    category('transport', 'Transporte', null),
    category('coffee', 'Café', 'food'),
    category('food', 'Alimentação', null),
    category('groceries', 'Mercado', 'food'),
    category('uber', 'Uber', 'transport'),
  ],
};

describe('categoryPaths', () => {
  it('names each category with its parents', () => {
    const paths = categoryPaths(DIRECTORY);

    expect(paths.get('coffee')).toBe('Alimentação › Café');
    expect(paths.get('food')).toBe('Alimentação');
  });
});

describe('categoryOptions', () => {
  it('lists each parent followed by its own subcategories', () => {
    expect(categoryOptions(DIRECTORY).map((option) => option.name)).toEqual([
      'Alimentação',
      'Alimentação › Café',
      'Alimentação › Mercado',
      'Salário',
      'Transporte',
      'Transporte › Uber',
    ]);
  });
});

describe('categoryFilterOptions', () => {
  it('lists spending categories before income categories', () => {
    expect(categoryFilterOptions(DIRECTORY).map((option) => option.key)).toEqual([
      'food',
      'coffee',
      'groceries',
      'transport',
      'uber',
      'salary',
    ]);
  });
});
