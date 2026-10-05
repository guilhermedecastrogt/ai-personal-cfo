import type { CategoryOption } from '../ai/ai-provider.js';
import type { Category } from '../categories/categories.repository.js';

export function toCategoryOptions(categories: readonly Category[]): CategoryOption[] {
  const names = new Map(categories.map((category) => [category.id, category.name]));
  return categories.map((category) => ({
    name: category.name,
    kind: category.kind,
    parent: category.parentId === null ? null : (names.get(category.parentId) ?? null),
  }));
}
