import { CategoryTree } from '../categories/category-tree.js';
import type { LedgerEntry } from './ledger-entry.js';

let sequence = 0;

export const CATEGORIES = new CategoryTree([
  { id: 'food', parentId: null },
  { id: 'groceries', parentId: 'food' },
  { id: 'restaurants', parentId: 'food' },
  { id: 'transport', parentId: null },
  { id: 'subscriptions', parentId: null },
  { id: 'salary', parentId: null },
]);

export function entry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  sequence += 1;
  return {
    id: `entry-${String(sequence)}`,
    type: 'EXPENSE',
    amountMinor: 1000,
    currency: 'EUR',
    date: '2026-10-05',
    memberId: 'member-a',
    accountId: 'account-joint',
    transferAccountId: null,
    categoryId: null,
    merchant: null,
    ...overrides,
  };
}

export function expense(amountMinor: number, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return entry({ type: 'EXPENSE', amountMinor, ...overrides });
}

export function income(amountMinor: number, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return entry({ type: 'INCOME', amountMinor, categoryId: 'salary', ...overrides });
}

export function transfer(amountMinor: number, overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return entry({
    type: 'TRANSFER',
    amountMinor,
    transferAccountId: 'account-savings',
    ...overrides,
  });
}
