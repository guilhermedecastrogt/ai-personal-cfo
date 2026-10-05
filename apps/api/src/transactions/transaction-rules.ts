export type TransactionRuleViolation =
  | 'ACCOUNT_CURRENCY_MISMATCH'
  | 'TRANSFER_WITHOUT_DESTINATION'
  | 'TRANSFER_TO_SAME_ACCOUNT'
  | 'TRANSFER_CURRENCY_MISMATCH'
  | 'TRANSFER_WITH_CATEGORY'
  | 'DESTINATION_WITHOUT_TRANSFER'
  | 'CATEGORY_KIND_MISMATCH';

export interface TransactionDraft {
  readonly type: 'EXPENSE' | 'INCOME' | 'TRANSFER';
  readonly currency: string;
}

export interface TransactionParties {
  readonly account: { readonly id: string; readonly currency: string };
  readonly transferAccount?: { readonly id: string; readonly currency: string } | undefined;
  readonly category?: { readonly kind: 'EXPENSE' | 'INCOME' } | undefined;
}

export function findTransactionRuleViolations(
  draft: TransactionDraft,
  parties: TransactionParties,
): TransactionRuleViolation[] {
  const violations: TransactionRuleViolation[] = [];
  if (draft.currency !== parties.account.currency) {
    violations.push('ACCOUNT_CURRENCY_MISMATCH');
  }
  if (draft.type === 'TRANSFER') {
    violations.push(...findTransferViolations(draft, parties));
  } else {
    violations.push(...findIncomeOrExpenseViolations(draft.type, parties));
  }
  return violations;
}

function findTransferViolations(
  draft: TransactionDraft,
  { account, transferAccount, category }: TransactionParties,
): TransactionRuleViolation[] {
  const violations: TransactionRuleViolation[] = [];
  if (transferAccount === undefined) {
    violations.push('TRANSFER_WITHOUT_DESTINATION');
  } else {
    if (transferAccount.id === account.id) {
      violations.push('TRANSFER_TO_SAME_ACCOUNT');
    }
    if (transferAccount.currency !== draft.currency) {
      violations.push('TRANSFER_CURRENCY_MISMATCH');
    }
  }
  if (category !== undefined) {
    violations.push('TRANSFER_WITH_CATEGORY');
  }
  return violations;
}

function findIncomeOrExpenseViolations(
  type: 'EXPENSE' | 'INCOME',
  { transferAccount, category }: TransactionParties,
): TransactionRuleViolation[] {
  const violations: TransactionRuleViolation[] = [];
  if (transferAccount !== undefined) {
    violations.push('DESTINATION_WITHOUT_TRANSFER');
  }
  if (category !== undefined && category.kind !== type) {
    violations.push('CATEGORY_KIND_MISMATCH');
  }
  return violations;
}
