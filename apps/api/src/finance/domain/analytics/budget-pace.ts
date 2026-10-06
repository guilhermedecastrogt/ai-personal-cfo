import { ratioInBasisPoints } from '../../../money/money-math.js';
import type { BudgetUsage } from '../budget/budget-usage.js';
import { daysInRange, elapsedDays, type IsoDate } from '../period/period.js';

export type BudgetPace = 'NOT_STARTED' | 'FASTER' | 'ON_PACE' | 'SLOWER';

export interface BudgetPaceResult {
  readonly budgetId: string;
  readonly elapsedBasisPoints: number;
  readonly pace: BudgetPace;
}

const PACE_TOLERANCE_IN_BASIS_POINTS = 1_000;

export function budgetPace(usage: BudgetUsage, asOf: IsoDate): BudgetPaceResult {
  const elapsedBasisPoints =
    ratioInBasisPoints(elapsedDays(usage.period, asOf), daysInRange(usage.period)) ?? 0;
  const difference = usage.usageBasisPoints - elapsedBasisPoints;
  const pace: BudgetPace =
    usage.spentMinor === 0
      ? 'NOT_STARTED'
      : difference > PACE_TOLERANCE_IN_BASIS_POINTS
        ? 'FASTER'
        : difference < -PACE_TOLERANCE_IN_BASIS_POINTS
          ? 'SLOWER'
          : 'ON_PACE';
  return { budgetId: usage.budgetId, elapsedBasisPoints, pace };
}
