import type { CashFlowSummary, PeriodFlow } from '../../finance/application/finance.service.js';
import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { CurrencyBalances } from '../../finance/domain/balances/account-balances.js';
import type { CashFlowOutlook } from '../../finance/domain/cash-flow/cash-flow.js';
import type { BudgetUsage } from '../../finance/domain/budget/budget-usage.js';
import type { SpendingForecast } from '../../finance/domain/forecast/spending-forecast.js';
import type { GoalProgress } from '../../finance/domain/goals/goal-progress.js';
import type { Insight } from '../../finance/domain/insights/insight-engine.js';
import type { DateRange, IsoDate } from '../../finance/domain/period/period.js';
import type { RecurringExpensePattern } from '../../finance/domain/recurring/recurring-expense-detector.js';
import type { SpendingTrends } from '../../finance/domain/trends/spending-trends.js';

export interface PreviousPeriodSnapshot {
  readonly period: DateRange;
  readonly cashFlow: CashFlowSummary;
  readonly transactionCount: number;
}

export interface FinancialSnapshot {
  readonly currency: string;
  readonly month: DateRange;
  readonly period: DateRange;
  readonly asOf: IsoDate;
  readonly isComplete: boolean;
  readonly cashFlow: CashFlowSummary;
  readonly spending: PeriodFlow;
  readonly income: PeriodFlow;
  readonly previous: PreviousPeriodSnapshot;
  readonly trends: SpendingTrends;
  readonly budgets: readonly BudgetUsage[];
  readonly goals: readonly GoalProgress[];
  readonly forecast: SpendingForecast | null;
  readonly outlook: CashFlowOutlook | null;
  readonly recurringExpenses: readonly RecurringExpensePattern[];
  readonly anomalies: readonly Anomaly[];
  readonly insights: readonly Insight[];
  readonly balances: CurrencyBalances | null;
  readonly topLevelCategoryIds: readonly string[];
}
