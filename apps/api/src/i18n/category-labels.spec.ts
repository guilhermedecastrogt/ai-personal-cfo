import { categoryLabel } from './category-labels.js';

const CANONICAL = [
  'Food',
  'Groceries',
  'Restaurants',
  'Coffee',
  'Delivery',
  'Housing',
  'Rent',
  'Electricity',
  'Internet',
  'Transport',
  'Fuel',
  'Public Transport',
  'Uber',
  'Health',
  'Shopping',
  'Entertainment',
  'Education',
  'Travel',
  'Subscriptions',
  'Other',
  'Salary',
  'Freelance',
];

describe('categoryLabel', () => {
  it('keeps the canonical name in English', () => {
    expect(CANONICAL.map((name) => categoryLabel(name, 'en'))).toEqual(CANONICAL);
  });

  it('gives every default category a distinct Portuguese label, so a label maps back to one category', () => {
    const labels = CANONICAL.map((name) => categoryLabel(name, 'pt-BR'));

    expect(new Set(labels).size).toBe(CANONICAL.length);
    expect(categoryLabel('Groceries', 'pt-BR')).toBe('Mercado');
    expect(categoryLabel('Salary', 'pt-BR')).toBe('Salário');
  });

  it('shows an unknown category under its own name', () => {
    expect(categoryLabel('Pets', 'pt-BR')).toBe('Pets');
  });
});
