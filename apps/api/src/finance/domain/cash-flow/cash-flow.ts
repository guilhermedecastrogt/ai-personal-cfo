import { sumMinor } from '../../../money/money-math.js';
import type { DateRange } from '../period/period.js';
import { amountsOf, flowsOf, type LedgerEntry } from '../ledger/ledger-entry.js';

export interface CashFlow {
  readonly currency: string;
  readonly incomeMinor: number;
  readonly expensesMinor: number;
  readonly netMinor: number;
}

export interface CashFlowOutlook {
  readonly currency: string;
  readonly period: DateRange;
  readonly expectedIncomeMinor: number;
  readonly projectedExpensesMinor: number;
  readonly projectedNetMinor: number;
}

export function calculateCashFlow(entries: readonly LedgerEntry[], currency: string): CashFlow {
  const incomeMinor = sumMinor(amountsOf(flowsOf(entries, 'INCOME', currency)));
  const expensesMinor = sumMinor(amountsOf(flowsOf(entries, 'EXPENSE', currency)));
  return {
    currency,
    incomeMinor,
    expensesMinor,
    netMinor: sumMinor([incomeMinor, -expensesMinor]),
  };
}

export function projectCashFlow(
  currency: string,
  period: DateRange,
  expectedIncomeMinor: number,
  projectedExpensesMinor: number,
): CashFlowOutlook {
  return {
    currency,
    period,
    expectedIncomeMinor,
    projectedExpensesMinor,
    projectedNetMinor: sumMinor([expectedIncomeMinor, -projectedExpensesMinor]),
  };
}
