import { Injectable, Logger } from '@nestjs/common';
import {
  BudgetRejectedError,
  BudgetsService,
  type BudgetEditOutcome,
  type BudgetInput,
} from '../budgets/budgets.service.js';
import { HouseholdDirectoryService } from '../directory/household-directory.service.js';
import { HouseholdNotFoundError } from '../finance/application/finance.service.js';
import {
  GoalRejectedError,
  GoalsService,
  type GoalEditOutcome,
  type GoalInput,
} from '../goals/goals.service.js';
import type { RequestContext } from '../households/request-context.js';
import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.js';
import { formatAmountInput } from '../money/format-money.js';
import { parseMoneyInput } from '../money/parse-money-input.js';
import { ProactiveCfoService } from '../proactive/proactive-cfo.service.js';
import {
  TransactionRejectedError,
  TransactionsService,
  type TransactionEditOutcome,
} from '../transactions/transactions.service.js';
import {
  budgetEditSchema,
  goalEditSchema,
  transactionEditSchema,
  type BudgetEditView,
  type FieldError,
  type GoalEditView,
  type SavedView,
  type TransactionEditView,
} from './dashboard.contracts.js';
import { budgetOptions, goalOptions, transactionOptions } from './edit-options.js';
import { budgetFieldErrors, goalFieldErrors, transactionFieldErrors } from './write-errors.js';
import type {
  BudgetEditRequest,
  BudgetRequest,
  GoalEditRequest,
  GoalRequest,
  TransactionEditRequest,
} from './write-requests.js';

export type WriteOutcome =
  | { readonly status: 'SAVED'; readonly saved: SavedView }
  | { readonly status: 'NOT_FOUND' }
  | { readonly status: 'STALE' }
  | { readonly status: 'INVALID'; readonly errors: readonly FieldError[] };

type Prepared<Input> =
  | { readonly valid: true; readonly input: Input }
  | { readonly valid: false; readonly errors: readonly FieldError[] };

const FORM_INVALID: readonly FieldError[] = [{ field: 'form', code: 'INVALID' }];

@Injectable()
export class DashboardWritesService {
  private readonly logger = new Logger(DashboardWritesService.name);

  constructor(
    private readonly directories: HouseholdDirectoryService,
    private readonly transactions: TransactionsService,
    private readonly budgets: BudgetsService,
    private readonly goals: GoalsService,
    private readonly proactive: ProactiveCfoService,
  ) {}

  async transaction(
    context: RequestContext,
    transactionId: string,
  ): Promise<TransactionEditView | undefined> {
    const [transaction, directory] = await Promise.all([
      this.transactions.find(context.householdId, transactionId),
      this.directories.load(context.householdId),
    ]);
    if (transaction === undefined) {
      return undefined;
    }
    const transferAccount =
      transaction.transferAccountId === null
        ? null
        : (directory.accounts.find((account) => account.id === transaction.transferAccountId)
            ?.name ?? null);
    return transactionEditSchema.parse({
      key: transaction.id,
      version: transaction.updatedAt.toISOString(),
      type: transaction.type,
      amount: formatAmountInput(transaction.amountMinor, transaction.currency, localeOf(context)),
      currency: transaction.currency,
      date: transaction.transactionDate,
      merchant: transaction.merchant,
      description: transaction.description,
      categoryKey: transaction.categoryId,
      memberKey: transaction.memberId,
      accountKey: transaction.accountId,
      transferAccount,
      expenseScope: transaction.expenseScope,
      source: transaction.source,
      options: transactionOptions(directory),
    });
  }

  async editTransaction(
    context: RequestContext,
    transactionId: string,
    request: TransactionEditRequest,
  ): Promise<WriteOutcome> {
    const directory = await this.directories.load(context.householdId);
    const account = directory.accounts.find((entry) => entry.id === request.account);
    const amountMinor =
      account === undefined ? undefined : parseMoneyInput(request.amount, account.currency);
    const errors: FieldError[] = [
      ...(account === undefined ? [{ field: 'account', code: 'UNKNOWN' } as const] : []),
      ...(account !== undefined && amountMinor === undefined
        ? [{ field: 'amount', code: 'INVALID_AMOUNT' } as const]
        : []),
    ];
    if (amountMinor === undefined || errors.length > 0) {
      return { status: 'INVALID', errors };
    }
    try {
      const outcome = await this.transactions.edit(
        context.householdId,
        transactionId,
        request.version,
        {
          type: request.type,
          amountMinor,
          memberId: request.member,
          accountId: request.account,
          categoryId: request.category,
          merchant: request.merchant,
          description: request.description,
          expenseScope: request.expenseScope,
          transactionDate: request.date,
        },
      );
      return this.settled(outcome, (edited) => edited.transaction, 'transaction-edited');
    } catch (error) {
      if (error instanceof TransactionRejectedError) {
        return invalid(transactionFieldErrors(error.reasons));
      }
      throw error;
    }
  }

  async removeTransaction(context: RequestContext, transactionId: string): Promise<boolean> {
    const removed = await this.transactions.remove(context.householdId, transactionId);
    if (removed) {
      this.logger.log('event=transaction-deleted');
    }
    return removed;
  }

  async budget(context: RequestContext, budgetId: string): Promise<BudgetEditView | undefined> {
    const [budget, directory, currency] = await Promise.all([
      this.budgets.find(context.householdId, budgetId),
      this.directories.load(context.householdId),
      this.householdCurrency(context),
    ]);
    if (budget === undefined) {
      return undefined;
    }
    return budgetEditSchema.parse({
      key: budget.id,
      version: budget.updatedAt.toISOString(),
      categoryKey: budget.categoryId,
      period: budget.period,
      limit: formatAmountInput(budget.limitMinor, budget.currency, localeOf(context)),
      currency: budget.currency,
      alertThresholdPercent: budget.alertThresholdPercent,
      startsOn: budget.startsOn,
      endsOn: budget.endsOn,
      options: budgetOptions(directory, currency, budget.startsOn),
    });
  }

  async createBudget(context: RequestContext, request: BudgetRequest): Promise<WriteOutcome> {
    const prepared = prepareBudget(request);
    if (!prepared.valid) {
      return { status: 'INVALID', errors: prepared.errors };
    }
    try {
      const budget = await this.budgets.create(context.householdId, prepared.input);
      this.logger.log('event=budget-created');
      return { status: 'SAVED', saved: savedOf(budget) };
    } catch (error) {
      if (error instanceof BudgetRejectedError) {
        return invalid(budgetFieldErrors(error.reasons));
      }
      throw error;
    }
  }

  async editBudget(
    context: RequestContext,
    budgetId: string,
    request: BudgetEditRequest,
  ): Promise<WriteOutcome> {
    const prepared = prepareBudget(request);
    if (!prepared.valid) {
      return { status: 'INVALID', errors: prepared.errors };
    }
    try {
      const outcome: BudgetEditOutcome = await this.budgets.edit(
        context.householdId,
        budgetId,
        request.version,
        prepared.input,
      );
      return this.settled(outcome, (edited) => edited.budget, 'budget-edited');
    } catch (error) {
      if (error instanceof BudgetRejectedError) {
        return invalid(budgetFieldErrors(error.reasons));
      }
      throw error;
    }
  }

  async removeBudget(context: RequestContext, budgetId: string, instant: Date): Promise<boolean> {
    const removed = await this.budgets.remove(context.householdId, budgetId);
    if (removed) {
      this.logger.log('event=budget-deleted');
      await this.proactive.suppressForBudget(context.householdId, budgetId, instant);
    }
    return removed;
  }

  async goal(context: RequestContext, goalId: string): Promise<GoalEditView | undefined> {
    const [goal, directory, currency] = await Promise.all([
      this.goals.find(context.householdId, goalId),
      this.directories.load(context.householdId),
      this.householdCurrency(context),
    ]);
    if (goal === undefined) {
      return undefined;
    }
    return goalEditSchema.parse({
      key: goal.id,
      version: goal.updatedAt.toISOString(),
      name: goal.name,
      type: goal.type,
      target: formatAmountInput(goal.targetAmountMinor, goal.currency, localeOf(context)),
      saved: formatAmountInput(goal.currentAmountMinor, goal.currency, localeOf(context)),
      currency: goal.currency,
      targetDate: goal.targetDate,
      options: goalOptions(directory, currency),
    });
  }

  async createGoal(context: RequestContext, request: GoalRequest): Promise<WriteOutcome> {
    const prepared = prepareGoal(request);
    if (!prepared.valid) {
      return { status: 'INVALID', errors: prepared.errors };
    }
    try {
      const goal = await this.goals.create(context.householdId, prepared.input);
      this.logger.log('event=goal-created');
      return { status: 'SAVED', saved: savedOf(goal) };
    } catch (error) {
      if (error instanceof GoalRejectedError) {
        return invalid(goalFieldErrors(error.reasons));
      }
      throw error;
    }
  }

  async editGoal(
    context: RequestContext,
    goalId: string,
    request: GoalEditRequest,
  ): Promise<WriteOutcome> {
    const prepared = prepareGoal(request);
    if (!prepared.valid) {
      return { status: 'INVALID', errors: prepared.errors };
    }
    try {
      const outcome: GoalEditOutcome = await this.goals.edit(
        context.householdId,
        goalId,
        request.version,
        prepared.input,
      );
      return this.settled(outcome, (edited) => edited.goal, 'goal-edited');
    } catch (error) {
      if (error instanceof GoalRejectedError) {
        return invalid(goalFieldErrors(error.reasons));
      }
      throw error;
    }
  }

  async removeGoal(context: RequestContext, goalId: string): Promise<boolean> {
    const removed = await this.goals.remove(context.householdId, goalId);
    if (removed) {
      this.logger.log('event=goal-deleted');
    }
    return removed;
  }

  private settled<Outcome extends TransactionEditOutcome | BudgetEditOutcome | GoalEditOutcome>(
    outcome: Outcome,
    record: (updated: Extract<Outcome, { status: 'UPDATED' }>) => {
      readonly id: string;
      readonly updatedAt: Date;
    },
    event: string,
  ): WriteOutcome {
    if (outcome.status !== 'UPDATED') {
      return { status: outcome.status };
    }
    this.logger.log(`event=${event}`);
    return {
      status: 'SAVED',
      saved: savedOf(record(outcome as Extract<Outcome, { status: 'UPDATED' }>)),
    };
  }

  private async householdCurrency(context: RequestContext): Promise<string> {
    const profile = await this.directories.profile(context.householdId);
    if (profile === undefined) {
      throw new HouseholdNotFoundError();
    }
    return profile.currency;
  }
}

function localeOf(context: RequestContext): Locale {
  return context.locale ?? DEFAULT_LOCALE;
}

function savedOf(record: { readonly id: string; readonly updatedAt: Date }): SavedView {
  return { key: record.id, version: record.updatedAt.toISOString() };
}

function invalid(errors: readonly FieldError[]): WriteOutcome {
  return { status: 'INVALID', errors: errors.length === 0 ? FORM_INVALID : errors };
}

function prepareBudget(request: BudgetRequest): Prepared<BudgetInput> {
  const limitMinor = parseMoneyInput(request.limit, request.currency);
  if (limitMinor === undefined) {
    return { valid: false, errors: [{ field: 'limit', code: 'INVALID_AMOUNT' }] };
  }
  return {
    valid: true,
    input: {
      categoryId: request.category,
      period: request.period,
      limitMinor,
      currency: request.currency,
      alertThresholdPercent: request.alertThresholdPercent,
      startsOn: request.startsOn,
      endsOn: request.endsOn,
    },
  };
}

function prepareGoal(request: GoalRequest): Prepared<GoalInput> {
  const targetMinor = parseMoneyInput(request.target, request.currency);
  const savedMinor =
    request.saved.trim() === ''
      ? 0
      : parseMoneyInput(request.saved, request.currency, { allowZero: true });
  const errors: FieldError[] = [
    ...(targetMinor === undefined ? [{ field: 'target', code: 'INVALID_AMOUNT' } as const] : []),
    ...(savedMinor === undefined ? [{ field: 'saved', code: 'INVALID_AMOUNT' } as const] : []),
  ];
  if (targetMinor === undefined || savedMinor === undefined) {
    return { valid: false, errors };
  }
  return {
    valid: true,
    input: {
      name: request.name,
      type: request.type,
      targetAmountMinor: targetMinor,
      currentAmountMinor: savedMinor,
      currency: request.currency,
      targetDate: request.targetDate,
    },
  };
}
