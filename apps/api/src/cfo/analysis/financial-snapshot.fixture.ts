import {
  calculateBudgetUsage,
  type BudgetUsage,
} from '../../finance/domain/budget/budget-usage.js';
import { calculateCashFlow } from '../../finance/domain/cash-flow/cash-flow.js';
import { DEFAULT_FINANCE_POLICY } from '../../finance/domain/finance-policy.js';
import { summarizeFlow } from '../../finance/domain/flow/flow-breakdown.js';
import { CATEGORIES, expense, income } from '../../finance/domain/ledger/ledger-entry.fixture.js';
import { within, type LedgerEntry } from '../../finance/domain/ledger/ledger-entry.js';
import { calendarMonth, previousEquivalentRange } from '../../finance/domain/period/period.js';
import { calculateSavings } from '../../finance/domain/savings/savings.js';
import { analyzeSpendingTrends } from '../../finance/domain/trends/spending-trends.js';
import type { CashFlowSummary, PeriodFlow } from '../../finance/application/finance.service.js';
import type { DateRange } from '../../finance/domain/period/period.js';
import type { FinancialSnapshot } from './financial-snapshot.js';

export const OCTOBER = calendarMonth(2026, 10);
export const REVIEW_POLICY = DEFAULT_FINANCE_POLICY;
export const MEMBER_IDS = ['member-a', 'member-b', 'member-c'];

export interface SnapshotOptions {
  readonly entries?: readonly LedgerEntry[];
  readonly asOf?: string;
  readonly memberIds?: readonly string[];
  readonly overrides?: Partial<FinancialSnapshot>;
}

function flow(
  entries: readonly LedgerEntry[],
  period: DateRange,
  type: 'EXPENSE' | 'INCOME',
  memberIds: readonly string[],
): PeriodFlow {
  return {
    period,
    ...summarizeFlow({
      entries: within(entries, period),
      type,
      currency: 'EUR',
      categories: CATEGORIES,
      memberIds,
    }),
  };
}

function cashFlowOf(entries: readonly LedgerEntry[], period: DateRange): CashFlowSummary {
  const cashFlow = calculateCashFlow(within(entries, period), 'EUR');
  return { period, cashFlow, savings: calculateSavings(cashFlow) };
}

export function restaurantBudget(entries: readonly LedgerEntry[], limitMinor = 30000): BudgetUsage {
  return calculateBudgetUsage({
    budget: {
      id: 'budget-restaurants',
      categoryId: 'restaurants',
      limitMinor,
      currency: 'EUR',
      alertThresholdPercent: 80,
    },
    period: OCTOBER,
    asOf: '2026-10-31',
    entries,
    history: [],
    categories: CATEGORIES,
  });
}

export function snapshotOf(options: SnapshotOptions = {}): FinancialSnapshot {
  const entries = options.entries ?? [];
  const asOf = options.asOf ?? OCTOBER.end;
  const memberIds = options.memberIds ?? MEMBER_IDS;
  const period = { start: OCTOBER.start, end: asOf };
  const previousPeriod = previousEquivalentRange(period);
  const previousSpending = flow(entries, previousPeriod, 'EXPENSE', memberIds);
  const previousIncome = flow(entries, previousPeriod, 'INCOME', memberIds);
  return {
    currency: 'EUR',
    month: OCTOBER,
    period,
    asOf,
    isComplete: asOf >= OCTOBER.end,
    cashFlow: cashFlowOf(entries, period),
    spending: flow(entries, period, 'EXPENSE', memberIds),
    income: flow(entries, period, 'INCOME', memberIds),
    previous: {
      period: previousPeriod,
      cashFlow: cashFlowOf(entries, previousPeriod),
      transactionCount: previousSpending.transactionCount + previousIncome.transactionCount,
    },
    trends: analyzeSpendingTrends({
      currency: 'EUR',
      currentPeriod: period,
      previousPeriod,
      entries,
      categories: CATEGORIES,
      memberIds,
    }),
    budgets: [],
    goals: [],
    forecast: null,
    recurringExpenses: [],
    anomalies: [],
    insights: [],
    balances: null,
    topLevelCategoryIds: ['food', 'transport', 'subscriptions', 'salary'],
    ...options.overrides,
  };
}

export const TYPICAL_MONTH: readonly LedgerEntry[] = [
  income(300000, { date: '2026-10-01', memberId: 'member-a' }),
  income(150000, { date: '2026-10-01', memberId: 'member-b' }),
  expense(24000, { date: '2026-10-05', categoryId: 'groceries', memberId: 'member-a' }),
  expense(18000, { date: '2026-10-12', categoryId: 'restaurants', memberId: 'member-b' }),
  expense(6000, { date: '2026-10-20', categoryId: 'transport', memberId: 'member-c' }),
  income(300000, { date: '2026-09-01', memberId: 'member-a' }),
  expense(20000, { date: '2026-09-05', categoryId: 'groceries', memberId: 'member-a' }),
  expense(9000, { date: '2026-09-12', categoryId: 'restaurants', memberId: 'member-b' }),
];
