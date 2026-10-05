import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../../accounts/accounts.repository.js';
import { BudgetsRepository, type Budget } from '../../budgets/budgets.repository.js';
import { CategoriesRepository } from '../../categories/categories.repository.js';
import { GoalsRepository } from '../../goals/goals.repository.js';
import { HouseholdsRepository } from '../../households/households.repository.js';
import {
  detectUnusualCategorySpending,
  detectUnusuallyLargeTransactions,
  type Anomaly,
} from '../domain/anomaly/anomaly-detector.js';
import {
  calculateAccountBalances,
  summarizeBalances,
  type AccountBalance,
  type CurrencyBalances,
} from '../domain/balances/account-balances.js';
import { calculateBudgetUsage, type BudgetUsage } from '../domain/budget/budget-usage.js';
import {
  calculateCashFlow,
  projectCashFlow,
  type CashFlow,
} from '../domain/cash-flow/cash-flow.js';
import { CategoryTree } from '../domain/categories/category-tree.js';
import { DEFAULT_FINANCE_POLICY } from '../domain/finance-policy.js';
import { summarizeFlow, type FlowBreakdown } from '../domain/flow/flow-breakdown.js';
import {
  forecastSpending,
  type PeriodEntries,
  type SpendingForecast,
} from '../domain/forecast/spending-forecast.js';
import { calculateGoalProgress, type GoalProgress } from '../domain/goals/goal-progress.js';
import { evaluateInsights, type Insight } from '../domain/insights/insight-engine.js';
import { within, type FlowType, type LedgerEntry } from '../domain/ledger/ledger-entry.js';
import { selectLargestExpenses, type ExpenseItem } from '../domain/listing/largest-expenses.js';
import {
  addDays,
  currentDateIn,
  monthContaining,
  monthToDate,
  periodContaining,
  previousEquivalentRange,
  previousPeriods,
  span,
  type DateRange,
  type IsoDate,
  type PeriodKind,
} from '../domain/period/period.js';
import {
  detectRecurringExpenses,
  type RecurringExpensePattern,
} from '../domain/recurring/recurring-expense-detector.js';
import { calculateSavings, type Savings } from '../domain/savings/savings.js';
import { analyzeSpendingTrends, type SpendingTrends } from '../domain/trends/spending-trends.js';
import { LedgerRepository } from '../infrastructure/ledger.repository.js';

export class HouseholdNotFoundError extends Error {
  constructor() {
    super('Household does not exist');
    this.name = HouseholdNotFoundError.name;
  }
}

export interface PeriodFlow extends FlowBreakdown {
  readonly period: DateRange;
}

export interface CashFlowSummary {
  readonly period: DateRange;
  readonly cashFlow: CashFlow;
  readonly savings: Savings;
}

export interface ExpenseFilter {
  readonly categoryId?: string | undefined;
  readonly memberId?: string | undefined;
  readonly accountId?: string | undefined;
}

export interface LargestExpenses {
  readonly period: DateRange;
  readonly currency: string;
  readonly expenses: readonly ExpenseItem[];
}

export interface HouseholdBalances {
  readonly accounts: readonly AccountBalance[];
  readonly totals: readonly CurrencyBalances[];
}

interface Scope {
  readonly householdId: string;
  readonly currency: string;
  readonly timezone: string;
  readonly memberIds: readonly string[];
  readonly categories: CategoryTree;
}

interface PeriodWindow {
  readonly period: DateRange;
  readonly entries: readonly LedgerEntry[];
  readonly history: readonly PeriodEntries[];
}

@Injectable()
export class FinanceService {
  private readonly policy = DEFAULT_FINANCE_POLICY;

  constructor(
    private readonly ledger: LedgerRepository,
    private readonly households: HouseholdsRepository,
    private readonly categories: CategoriesRepository,
    private readonly budgetDefinitions: BudgetsRepository,
    private readonly goalDefinitions: GoalsRepository,
    private readonly accounts: AccountsRepository,
  ) {}

  async currentDate(householdId: string, instant: Date): Promise<IsoDate> {
    const scope = await this.scopeOf(householdId);
    return currentDateIn(scope.timezone, instant);
  }

  async spending(householdId: string, period: DateRange, currency?: string): Promise<PeriodFlow> {
    return this.flow('EXPENSE', householdId, period, currency);
  }

  async income(householdId: string, period: DateRange, currency?: string): Promise<PeriodFlow> {
    return this.flow('INCOME', householdId, period, currency);
  }

  async cashFlow(
    householdId: string,
    period: DateRange,
    currency?: string,
  ): Promise<CashFlowSummary> {
    const scope = await this.scopeOf(householdId, currency);
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period,
    });
    const cashFlow = calculateCashFlow(entries, scope.currency);
    return { period, cashFlow, savings: calculateSavings(cashFlow) };
  }

  async budgets(householdId: string, asOf: IsoDate): Promise<BudgetUsage[]> {
    const scope = await this.scopeOf(householdId);
    const definitions = await this.budgetDefinitions.list(householdId);
    const active = definitions.filter(
      (budget) => budget.startsOn <= asOf && (budget.endsOn === null || asOf <= budget.endsOn),
    );
    return Promise.all(active.map((budget) => this.budgetUsage(scope, budget, asOf)));
  }

  async goals(householdId: string, asOf: IsoDate): Promise<GoalProgress[]> {
    await this.scopeOf(householdId);
    const definitions = await this.goalDefinitions.list(householdId);
    return definitions
      .filter((goal) => goal.status !== 'CANCELLED')
      .map((goal) => calculateGoalProgress(goal, asOf));
  }

  async spendingTrends(
    householdId: string,
    period: DateRange,
    currency?: string,
  ): Promise<SpendingTrends> {
    const scope = await this.scopeOf(householdId, currency);
    const previousPeriod = previousEquivalentRange(period);
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period: span([previousPeriod, period]),
    });
    return analyzeSpendingTrends({
      currency: scope.currency,
      currentPeriod: period,
      previousPeriod,
      entries,
      categories: scope.categories,
      memberIds: scope.memberIds,
    });
  }

  async recurringExpenses(
    householdId: string,
    asOf: IsoDate,
    currency?: string,
  ): Promise<RecurringExpensePattern[]> {
    const scope = await this.scopeOf(householdId, currency);
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period: { start: addDays(asOf, -this.policy.recurring.lookbackInDays), end: asOf },
    });
    return detectRecurringExpenses({
      entries,
      currency: scope.currency,
      asOf,
      policy: this.policy.recurring,
    });
  }

  async monthEndForecast(
    householdId: string,
    asOf: IsoDate,
    currency?: string,
  ): Promise<SpendingForecast> {
    const scope = await this.scopeOf(householdId, currency);
    const window = await this.loadWindow(
      scope,
      'MONTHLY',
      asOf,
      this.policy.forecast.historyPeriods,
    );
    return forecastSpending({ currency: scope.currency, asOf, ...window });
  }

  async anomalies(householdId: string, asOf: IsoDate, currency?: string): Promise<Anomaly[]> {
    const scope = await this.scopeOf(householdId, currency);
    const month = monthContaining(asOf);
    const baselineMonths = previousPeriods('MONTHLY', month, this.policy.anomaly.baselinePeriods);
    const lookback = { start: addDays(asOf, -this.policy.anomaly.lookbackInDays), end: asOf };
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period: span([lookback, month, ...baselineMonths]),
    });
    return [
      ...detectUnusuallyLargeTransactions({
        currency: scope.currency,
        candidates: within(entries, monthToDate(asOf)),
        history: within(entries, lookback),
        policy: this.policy.anomaly,
      }),
      ...detectUnusualCategorySpending({
        currency: scope.currency,
        period: month,
        asOf,
        entries,
        history: baselineMonths.map((period) => ({ period, entries: within(entries, period) })),
        policy: this.policy.anomaly,
      }),
    ];
  }

  async largestExpenses(
    householdId: string,
    period: DateRange,
    filter: ExpenseFilter = {},
    currency?: string,
  ): Promise<LargestExpenses> {
    const scope = await this.scopeOf(householdId, currency);
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period,
    });
    const { categoryId, memberId, accountId } = filter;
    const matching = entries.filter(
      (entry) =>
        (categoryId === undefined || scope.categories.isWithin(entry.categoryId, categoryId)) &&
        (memberId === undefined || entry.memberId === memberId) &&
        (accountId === undefined || entry.accountId === accountId),
    );
    return {
      period,
      currency: scope.currency,
      expenses: selectLargestExpenses(
        matching,
        scope.currency,
        this.policy.listing.largestExpenses,
      ),
    };
  }

  async accountBalances(householdId: string): Promise<HouseholdBalances> {
    const scope = await this.scopeOf(householdId);
    const [accounts, entries] = await Promise.all([
      this.accounts.list(householdId),
      this.ledger.findEntries(householdId),
    ]);
    const balances = calculateAccountBalances(accounts, entries);
    return { accounts: balances, totals: summarizeBalances(balances, scope.memberIds) };
  }

  async insights(householdId: string, asOf: IsoDate, currency?: string): Promise<Insight[]> {
    const scope = await this.scopeOf(householdId, currency);
    const month = monthContaining(asOf);
    const [budgets, trends, anomalies, recurringExpenses, goals, forecast, income, previousIncome] =
      await Promise.all([
        this.budgets(householdId, asOf),
        this.spendingTrends(householdId, monthToDate(asOf), scope.currency),
        this.anomalies(householdId, asOf, scope.currency),
        this.recurringExpenses(householdId, asOf, scope.currency),
        this.goals(householdId, asOf),
        this.monthEndForecast(householdId, asOf, scope.currency),
        this.income(householdId, month, scope.currency),
        this.income(householdId, previousEquivalentRange(month), scope.currency),
      ]);
    return evaluateInsights(
      {
        budgets,
        trends,
        anomalies,
        recurringExpenses,
        goals,
        cashFlowOutlook: projectCashFlow(
          scope.currency,
          month,
          Math.max(income.totalMinor, previousIncome.totalMinor),
          forecast.projectedTotalMinor,
        ),
      },
      this.policy.insights,
    );
  }

  private async flow(
    type: FlowType,
    householdId: string,
    period: DateRange,
    currency: string | undefined,
  ): Promise<PeriodFlow> {
    const scope = await this.scopeOf(householdId, currency);
    const entries = await this.ledger.findEntries(householdId, {
      currency: scope.currency,
      period,
    });
    return {
      period,
      ...summarizeFlow({
        entries,
        type,
        currency: scope.currency,
        categories: scope.categories,
        memberIds: scope.memberIds,
      }),
    };
  }

  private async budgetUsage(scope: Scope, budget: Budget, asOf: IsoDate): Promise<BudgetUsage> {
    const window = await this.loadWindow(
      { ...scope, currency: budget.currency },
      budget.period,
      asOf,
      this.policy.forecast.historyPeriods,
    );
    return calculateBudgetUsage({
      budget,
      asOf,
      categories: scope.categories,
      memberIds: scope.memberIds,
      ...window,
    });
  }

  private async loadWindow(
    scope: Scope,
    kind: PeriodKind,
    asOf: IsoDate,
    historyPeriods: number,
  ): Promise<PeriodWindow> {
    const period = periodContaining(kind, asOf);
    const pastPeriods = previousPeriods(kind, period, historyPeriods);
    const entries = await this.ledger.findEntries(scope.householdId, {
      currency: scope.currency,
      period: span([period, ...pastPeriods]),
    });
    return {
      period,
      entries: within(entries, period),
      history: pastPeriods.map((past) => ({ period: past, entries: within(entries, past) })),
    };
  }

  private async scopeOf(householdId: string, currency?: string): Promise<Scope> {
    const [household, members, categories] = await Promise.all([
      this.households.findHousehold(householdId),
      this.households.listMembers(householdId),
      this.categories.list(),
    ]);
    if (household === undefined) {
      throw new HouseholdNotFoundError();
    }
    return {
      householdId,
      currency: currency ?? household.currency,
      timezone: household.timezone,
      memberIds: members.map((member) => member.id),
      categories: new CategoryTree(categories),
    };
  }
}
