import { ratioInBasisPoints } from '../../../money/money-math.js';
import { calculateCashFlow } from '../cash-flow/cash-flow.js';
import { within, type LedgerEntry } from '../ledger/ledger-entry.js';
import type { DateRange } from '../period/period.js';

export interface MonthlyCashFlow {
  readonly period: DateRange;
  readonly incomeMinor: number;
  readonly expensesMinor: number;
  readonly netMinor: number;
  readonly incomeBarBasisPoints: number;
  readonly expensesBarBasisPoints: number;
}

export function buildMonthlySeries(
  entries: readonly LedgerEntry[],
  currency: string,
  periods: readonly DateRange[],
): MonthlyCashFlow[] {
  const flows = periods.map((period) => ({
    period,
    cashFlow: calculateCashFlow(within(entries, period), currency),
  }));
  const largest = Math.max(
    0,
    ...flows.flatMap(({ cashFlow }) => [cashFlow.incomeMinor, cashFlow.expensesMinor]),
  );
  return flows.map(({ period, cashFlow }) => ({
    period,
    incomeMinor: cashFlow.incomeMinor,
    expensesMinor: cashFlow.expensesMinor,
    netMinor: cashFlow.netMinor,
    incomeBarBasisPoints: ratioInBasisPoints(cashFlow.incomeMinor, largest) ?? 0,
    expensesBarBasisPoints: ratioInBasisPoints(cashFlow.expensesMinor, largest) ?? 0,
  }));
}
