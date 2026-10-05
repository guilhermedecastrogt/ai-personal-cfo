import { findTransactionRuleViolations } from './transaction-rules.js';

const CURRENT_ACCOUNT = { id: 'current', currency: 'EUR' };
const SAVINGS_ACCOUNT = { id: 'savings', currency: 'EUR' };
const FOREIGN_ACCOUNT = { id: 'foreign', currency: 'BRL' };
const EXPENSE_CATEGORY = { kind: 'EXPENSE' } as const;
const INCOME_CATEGORY = { kind: 'INCOME' } as const;

describe('findTransactionRuleViolations', () => {
  describe('expenses and income', () => {
    it('accepts an expense in the currency of its account', () => {
      const violations = findTransactionRuleViolations(
        { type: 'EXPENSE', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, category: EXPENSE_CATEGORY },
      );

      expect(violations).toEqual([]);
    });

    it('accepts income without a category', () => {
      const violations = findTransactionRuleViolations(
        { type: 'INCOME', currency: 'EUR' },
        { account: CURRENT_ACCOUNT },
      );

      expect(violations).toEqual([]);
    });

    it('rejects a currency different from the account currency', () => {
      const violations = findTransactionRuleViolations(
        { type: 'EXPENSE', currency: 'BRL' },
        { account: CURRENT_ACCOUNT },
      );

      expect(violations).toEqual(['ACCOUNT_CURRENCY_MISMATCH']);
    });

    it('rejects an expense filed under an income category', () => {
      const violations = findTransactionRuleViolations(
        { type: 'EXPENSE', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, category: INCOME_CATEGORY },
      );

      expect(violations).toEqual(['CATEGORY_KIND_MISMATCH']);
    });

    it('rejects income filed under an expense category', () => {
      const violations = findTransactionRuleViolations(
        { type: 'INCOME', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, category: EXPENSE_CATEGORY },
      );

      expect(violations).toEqual(['CATEGORY_KIND_MISMATCH']);
    });

    it('rejects a destination account on anything but a transfer', () => {
      const violations = findTransactionRuleViolations(
        { type: 'EXPENSE', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, transferAccount: SAVINGS_ACCOUNT },
      );

      expect(violations).toEqual(['DESTINATION_WITHOUT_TRANSFER']);
    });
  });

  describe('transfers', () => {
    it('accepts a transfer between two accounts in the same currency', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, transferAccount: SAVINGS_ACCOUNT },
      );

      expect(violations).toEqual([]);
    });

    it('rejects a transfer without a destination', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'EUR' },
        { account: CURRENT_ACCOUNT },
      );

      expect(violations).toEqual(['TRANSFER_WITHOUT_DESTINATION']);
    });

    it('rejects a transfer from an account to itself', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, transferAccount: CURRENT_ACCOUNT },
      );

      expect(violations).toEqual(['TRANSFER_TO_SAME_ACCOUNT']);
    });

    it('rejects a transfer between accounts in different currencies', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, transferAccount: FOREIGN_ACCOUNT },
      );

      expect(violations).toEqual(['TRANSFER_CURRENCY_MISMATCH']);
    });

    it('rejects a category on a transfer so it can never count as spending', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'EUR' },
        { account: CURRENT_ACCOUNT, transferAccount: SAVINGS_ACCOUNT, category: EXPENSE_CATEGORY },
      );

      expect(violations).toEqual(['TRANSFER_WITH_CATEGORY']);
    });

    it('reports every violation at once', () => {
      const violations = findTransactionRuleViolations(
        { type: 'TRANSFER', currency: 'BRL' },
        { account: CURRENT_ACCOUNT, transferAccount: CURRENT_ACCOUNT, category: EXPENSE_CATEGORY },
      );

      expect(violations).toEqual([
        'ACCOUNT_CURRENCY_MISMATCH',
        'TRANSFER_TO_SAME_ACCOUNT',
        'TRANSFER_CURRENCY_MISMATCH',
        'TRANSFER_WITH_CATEGORY',
      ]);
    });
  });
});
