import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import {
  newTransactionSchema,
  type NewTransaction,
  type NewTransactionInput,
} from './new-transaction.schema.js';
import {
  findTransactionRuleViolations,
  type TransactionRuleViolation,
} from './transaction-rules.js';
import {
  TransactionsRepository,
  type Transaction,
  type TransactionPage,
  type TransactionSearch,
} from './transactions.repository.js';
import type { ExpenseScope, TransactionType } from './transaction-vocabulary.js';

export type TransactionRejectionReason =
  | TransactionRuleViolation
  | 'INVALID_INPUT'
  | 'UNKNOWN_MEMBER'
  | 'UNKNOWN_ACCOUNT'
  | 'UNKNOWN_TRANSFER_ACCOUNT'
  | 'UNKNOWN_CATEGORY'
  | 'TYPE_CHANGE_NOT_ALLOWED';

export interface TransactionEdit {
  readonly type: TransactionType;
  readonly amountMinor: number;
  readonly memberId: string;
  readonly accountId: string;
  readonly categoryId: string | null;
  readonly merchant: string | null;
  readonly description: string | null;
  readonly expenseScope: ExpenseScope;
  readonly transactionDate: string;
}

export type TransactionEditOutcome =
  | { readonly status: 'UPDATED'; readonly transaction: Transaction }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'STALE' };

export type { NewTransaction, Transaction, TransactionPage, TransactionSearch };

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
    return this.transactions.create(householdId, await this.validate(householdId, input));
  }

  async check(householdId: string, input: NewTransactionInput): Promise<NewTransaction> {
    return this.validate(householdId, input);
  }

  async recordBatch(
    householdId: string,
    batch: readonly NewTransaction[],
    instant: Date,
  ): Promise<Transaction[]> {
    return this.transactions.createMany(householdId, batch, instant);
  }

  async find(householdId: string, transactionId: string): Promise<Transaction | undefined> {
    return this.transactions.findById(householdId, transactionId);
  }

  async edit(
    householdId: string,
    transactionId: string,
    version: string,
    edit: TransactionEdit,
  ): Promise<TransactionEditOutcome> {
    const existing = await this.transactions.findById(householdId, transactionId);
    if (existing === undefined) {
      return { status: 'NOT_FOUND' };
    }
    if (existing.updatedAt.toISOString() !== version) {
      return { status: 'STALE' };
    }
    if ((existing.type === 'TRANSFER') !== (edit.type === 'TRANSFER')) {
      throw new TransactionRejectedError(['TYPE_CHANGE_NOT_ALLOWED']);
    }
    const account = await this.accounts.findById(householdId, edit.accountId);
    const transaction = await this.validate(householdId, {
      memberId: edit.memberId,
      accountId: edit.accountId,
      transferAccountId: existing.transferAccountId ?? undefined,
      type: edit.type,
      amountMinor: edit.amountMinor,
      currency: account?.currency ?? existing.currency,
      merchant: edit.merchant ?? undefined,
      description: edit.description ?? undefined,
      categoryId: edit.categoryId ?? undefined,
      expenseScope: edit.expenseScope,
      transactionDate: edit.transactionDate,
      source: existing.source,
    });
    const updated = await this.transactions.update(householdId, transactionId, version, {
      memberId: transaction.memberId,
      accountId: transaction.accountId,
      type: transaction.type,
      amountMinor: transaction.amountMinor,
      currency: transaction.currency,
      merchant: transaction.merchant ?? null,
      description: transaction.description ?? null,
      categoryId: transaction.categoryId ?? null,
      expenseScope: transaction.expenseScope,
      transactionDate: transaction.transactionDate,
    });
    if (updated !== undefined) {
      return { status: 'UPDATED', transaction: updated };
    }
    return (await this.transactions.findById(householdId, transactionId)) === undefined
      ? { status: 'NOT_FOUND' }
      : { status: 'STALE' };
  }

  async remove(householdId: string, transactionId: string): Promise<boolean> {
    return this.transactions.delete(householdId, transactionId);
  }

  private async validate(householdId: string, input: NewTransactionInput): Promise<NewTransaction> {
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
    return transaction;
  }

  async findBySourceMessage(
    householdId: string,
    sourceMessageId: string,
  ): Promise<Transaction | undefined> {
    return this.transactions.findBySourceMessage(householdId, sourceMessageId);
  }

  async search(householdId: string, search: TransactionSearch): Promise<TransactionPage> {
    return this.transactions.search(householdId, search);
  }

  async earliestDate(householdId: string): Promise<string | undefined> {
    return this.transactions.earliestDate(householdId);
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
