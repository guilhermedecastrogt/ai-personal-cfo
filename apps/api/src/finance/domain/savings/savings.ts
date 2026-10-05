import { ratioInBasisPoints } from '../../../money/money-math.js';
import type { CashFlow } from '../cash-flow/cash-flow.js';

export interface Savings {
  readonly currency: string;
  readonly savingsMinor: number;
  readonly savingsRateBasisPoints: number | null;
}

export function calculateSavings(cashFlow: CashFlow): Savings {
  return {
    currency: cashFlow.currency,
    savingsMinor: cashFlow.netMinor,
    savingsRateBasisPoints: ratioInBasisPoints(cashFlow.netMinor, cashFlow.incomeMinor),
  };
}
