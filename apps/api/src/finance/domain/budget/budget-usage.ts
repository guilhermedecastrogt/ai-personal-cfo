import { ratioInBasisPoints, sumMinor } from '../../../money/money-math.js';
import type { CategoryTree } from '../categories/category-tree.js';
import { breakDownByMember, type MemberAmount } from '../flow/flow-breakdown.js';
import {
  forecastSpending,
  type PeriodEntries,
  type SpendingForecast,
} from '../forecast/spending-forecast.js';
import { amountsOf, flowsOf, within, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { DateRange, IsoDate } from '../period/period.js';

export type BudgetStatus = 'NOT_STARTED' | 'ON_TRACK' | 'NEAR_LIMIT' | 'EXCEEDED';

export interface BudgetDefinition {
  readonly id: string;
  readonly categoryId: string | null;
  readonly limitMinor: number;
  readonly currency: string;
  readonly alertThresholdPercent: number;
}

export interface BudgetUsage {
  readonly budgetId: string;
  readonly categoryId: string | null;
  readonly period: DateRange;
  readonly currency: string;
  readonly limitMinor: number;
  readonly spentMinor: number;
  readonly remainingMinor: number;
  readonly usageBasisPoints: number;
  readonly alertThresholdPercent: number;
  readonly status: BudgetStatus;
  readonly byMember: readonly MemberAmount[];
  readonly forecast: SpendingForecast;
}

export interface BudgetUsageInput {
  readonly budget: BudgetDefinition;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly entries: readonly LedgerEntry[];
  readonly history: readonly PeriodEntries[];
  readonly categories: CategoryTree;
  readonly memberIds?: readonly string[];
}

export class InvalidBudgetError extends Error {
  constructor() {
    super('A budget needs a positive limit and an alert threshold from 1 to 100');
    this.name = InvalidBudgetError.name;
  }
}

const PERCENT_PER_WHOLE = 100;

export function calculateBudgetUsage(input: BudgetUsageInput): BudgetUsage {
  const { budget, period, categories } = input;
  assertValidBudget(budget);
  const expenses = budgetExpenses(budget, within(input.entries, period), categories);
  const spentMinor = sumMinor(amountsOf(expenses));
  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    period,
    currency: budget.currency,
    limitMinor: budget.limitMinor,
    spentMinor,
    remainingMinor: sumMinor([budget.limitMinor, -spentMinor]),
    usageBasisPoints: ratioInBasisPoints(spentMinor, budget.limitMinor) ?? 0,
    alertThresholdPercent: budget.alertThresholdPercent,
    status: determineBudgetStatus(spentMinor, budget.limitMinor, budget.alertThresholdPercent),
    byMember: breakDownByMember(expenses, input.memberIds ?? []),
    forecast: forecastSpending({
      currency: budget.currency,
      period,
      asOf: input.asOf,
      entries: expenses,
      history: input.history.map((past) => ({
        period: past.period,
        entries: budgetExpenses(budget, past.entries, categories),
      })),
    }),
  };
}

export function determineBudgetStatus(
  spentMinor: number,
  limitMinor: number,
  alertThresholdPercent: number,
): BudgetStatus {
  if (spentMinor <= 0) {
    return 'NOT_STARTED';
  }
  if (spentMinor > limitMinor) {
    return 'EXCEEDED';
  }
  const reachedThreshold =
    BigInt(spentMinor) * BigInt(PERCENT_PER_WHOLE) >=
    BigInt(limitMinor) * BigInt(alertThresholdPercent);
  return reachedThreshold ? 'NEAR_LIMIT' : 'ON_TRACK';
}

function budgetExpenses(
  budget: BudgetDefinition,
  entries: readonly LedgerEntry[],
  categories: CategoryTree,
): LedgerEntry[] {
  const expenses = flowsOf(entries, 'EXPENSE', budget.currency);
  const { categoryId } = budget;
  return categoryId === null
    ? expenses
    : expenses.filter((expense) => categories.isWithin(expense.categoryId, categoryId));
}

function assertValidBudget(budget: BudgetDefinition): void {
  const hasValidLimit = Number.isSafeInteger(budget.limitMinor) && budget.limitMinor > 0;
  const hasValidThreshold =
    Number.isInteger(budget.alertThresholdPercent) &&
    budget.alertThresholdPercent >= 1 &&
    budget.alertThresholdPercent <= PERCENT_PER_WHOLE;
  if (!hasValidLimit || !hasValidThreshold) {
    throw new InvalidBudgetError();
  }
}
