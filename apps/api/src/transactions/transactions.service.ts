import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import { newTransactionSchema, type NewTransactionInput } from './new-transaction.schema.js';
import {
  findTransactionRuleViolations,
  type TransactionRuleViolation,
} from './transaction-rules.js';
import { TransactionsRepository, type Transaction } from './transactions.repository.js';

export type TransactionRejectionReason =
  | TransactionRuleViolation
  | 'INVALID_INPUT'
  | 'UNKNOWN_MEMBER'
  | 'UNKNOWN_ACCOUNT'
  | 'UNKNOWN_TRANSFER_ACCOUNT'
  | 'UNKNOWN_CATEGORY';

export type { Transaction };

export class TransactionRejectedError extends Error {
  constructor(readonly reasons: readonly TransactionRejectionReason[]) {
    super(`Transaction rejected: ${reasons.join(', ')}`);
    this.name = TransactionRejectedError.name;
  }
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly transactions: TransactionsRepository,
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
  ) {}

  async record(householdId: string, input: NewTransactionInput): Promise<Transaction> {
    const parsed = newTransactionSchema.safeParse(input);
    if (!parsed.success) {
      throw new TransactionRejectedError(['INVALID_INPUT']);
    }
    const transaction = parsed.data;
    const [member, account, transferAccount, category] = await Promise.all([
      this.households.findMember(householdId, transaction.memberId),
      this.accounts.findById(householdId, transaction.accountId),
      this.findOptionalAccount(householdId, transaction.transferAccountId),
      this.findOptionalCategory(transaction.categoryId),
    ]);
    const unknownReferences: TransactionRejectionReason[] = [
      ...(member === undefined ? (['UNKNOWN_MEMBER'] as const) : []),
      ...(account === undefined ? (['UNKNOWN_ACCOUNT'] as const) : []),
      ...(transaction.transferAccountId !== undefined && transferAccount === undefined
        ? (['UNKNOWN_TRANSFER_ACCOUNT'] as const)
        : []),
      ...(transaction.categoryId !== undefined && category === undefined
        ? (['UNKNOWN_CATEGORY'] as const)
        : []),
    ];
    if (account === undefined || unknownReferences.length > 0) {
      throw new TransactionRejectedError(unknownReferences);
    }
    const violations = findTransactionRuleViolations(transaction, {
      account,
      transferAccount,
      category,
    });
    if (violations.length > 0) {
      throw new TransactionRejectedError(violations);
    }
    return this.transactions.create(householdId, transaction);
  }

  async findBySourceMessage(
    householdId: string,
    sourceMessageId: string,
  ): Promise<Transaction | undefined> {
    return this.transactions.findBySourceMessage(householdId, sourceMessageId);
  }

  private async findOptionalAccount(
    householdId: string,
    accountId: string | undefined,
  ): ReturnType<AccountsRepository['findById']> {
    return accountId === undefined ? undefined : this.accounts.findById(householdId, accountId);
  }

  private async findOptionalCategory(
    categoryId: string | undefined,
  ): ReturnType<CategoriesRepository['findById']> {
    return categoryId === undefined ? undefined : this.categories.findById(categoryId);
  }
}
