import { Injectable } from '@nestjs/common';
import { FinanceService } from '../../finance/application/finance.service.js';
import type { Insight } from '../../finance/domain/insights/insight-engine.js';
import {
  previousEquivalentRange,
  type DateRange,
  type IsoDate,
} from '../../finance/domain/period/period.js';
import type { FinancialSnapshot } from './financial-snapshot.js';

export interface SnapshotRequest {
  readonly householdId: string;
  readonly currency: string;
  readonly month: DateRange;
  readonly today: IsoDate;
  readonly topLevelCategoryIds: readonly string[];
}

@Injectable()
export class FinancialSnapshotBuilder {
  constructor(private readonly finance: FinanceService) {}

  async build(request: SnapshotRequest): Promise<FinancialSnapshot> {
    const { householdId, currency, month, today } = request;
    const isComplete = month.end <= today;
    const asOf = isComplete ? month.end : today;
    const period = { start: month.start, end: asOf };
    const previousPeriod = previousEquivalentRange(period);
    const [
      cashFlow,
      spending,
      income,
      previousCashFlow,
      previousSpending,
      previousIncome,
      trends,
      budgets,
      goals,
      forecast,
      recurringExpenses,
      anomalies,
      insights,
      balances,
    ] = await Promise.all([
      this.finance.cashFlow(householdId, period, currency),
      this.finance.spending(householdId, period, currency),
      this.finance.income(householdId, period, currency),
      this.finance.cashFlow(householdId, previousPeriod, currency),
      this.finance.spending(householdId, previousPeriod, currency),
      this.finance.income(householdId, previousPeriod, currency),
      this.finance.spendingTrends(householdId, period, currency),
      this.finance.budgets(householdId, asOf),
      this.finance.goals(householdId, asOf),
      this.finance.monthEndForecast(householdId, asOf, currency),
      this.finance.recurringExpenses(householdId, asOf, currency),
      this.finance.anomalies(householdId, asOf, currency),
      this.finance.insights(householdId, asOf, currency),
      this.finance.accountBalances(householdId),
    ]);
    return {
      currency,
      month,
      period,
      asOf,
      isComplete,
      cashFlow,
      spending,
      income,
      previous: {
        period: previousPeriod,
        cashFlow: previousCashFlow,
        transactionCount: previousSpending.transactionCount + previousIncome.transactionCount,
      },
      trends,
      budgets: budgets.filter((budget) => budget.currency === currency),
      goals: goals.filter((goal) => goal.currency === currency),
      forecast: isComplete ? null : forecast,
      recurringExpenses,
      anomalies,
      insights: insights.filter((insight) => currencyOf(insight) === currency),
      balances: isComplete
        ? null
        : (balances.totals.find((totals) => totals.currency === currency) ?? null),
      topLevelCategoryIds: request.topLevelCategoryIds,
    };
  }
}

function currencyOf(insight: Insight): string {
  return insight.evidence.currency;
}
