import { multiplyThenDivide, ratioInBasisPoints } from '../../../money/money-math.js';
import { daysBetween, type IsoDate } from '../period/period.js';

export type GoalState = 'COMPLETED' | 'OVERDUE' | 'IN_PROGRESS';

export interface GoalDefinition {
  readonly id: string;
  readonly currency: string;
  readonly targetAmountMinor: number;
  readonly currentAmountMinor: number;
  readonly targetDate: IsoDate | null;
}

export interface GoalProgress {
  readonly goalId: string;
  readonly currency: string;
  readonly targetMinor: number;
  readonly currentMinor: number;
  readonly remainingMinor: number;
  readonly progressBasisPoints: number;
  readonly state: GoalState;
  readonly targetDate: IsoDate | null;
  readonly daysRemaining: number | null;
  readonly requiredMonthlyMinor: number | null;
}

export class InvalidGoalError extends Error {
  constructor() {
    super('A goal needs a positive target and a non-negative saved amount');
    this.name = InvalidGoalError.name;
  }
}

const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;

export function calculateGoalProgress(goal: GoalDefinition, asOf: IsoDate): GoalProgress {
  assertValidGoal(goal);
  const remainingMinor = Math.max(goal.targetAmountMinor - goal.currentAmountMinor, 0);
  const daysRemaining = goal.targetDate === null ? null : daysBetween(asOf, goal.targetDate);
  const state = determineGoalState(remainingMinor, daysRemaining);
  return {
    goalId: goal.id,
    currency: goal.currency,
    targetMinor: goal.targetAmountMinor,
    currentMinor: goal.currentAmountMinor,
    remainingMinor,
    progressBasisPoints: ratioInBasisPoints(goal.currentAmountMinor, goal.targetAmountMinor) ?? 0,
    state,
    targetDate: goal.targetDate,
    daysRemaining,
    requiredMonthlyMinor:
      state === 'IN_PROGRESS' && daysRemaining !== null
        ? requiredMonthlySaving(remainingMinor, daysRemaining)
        : null,
  };
}

function determineGoalState(remainingMinor: number, daysRemaining: number | null): GoalState {
  if (remainingMinor === 0) {
    return 'COMPLETED';
  }
  return daysRemaining !== null && daysRemaining < 0 ? 'OVERDUE' : 'IN_PROGRESS';
}

function requiredMonthlySaving(remainingMinor: number, daysRemaining: number): number {
  if (daysRemaining === 0) {
    return remainingMinor;
  }
  const monthlyMinor = multiplyThenDivide(
    remainingMinor,
    DAYS_PER_YEAR,
    MONTHS_PER_YEAR * daysRemaining,
  );
  return Math.min(monthlyMinor, remainingMinor);
}

function assertValidGoal(goal: GoalDefinition): void {
  const isValid =
    Number.isSafeInteger(goal.targetAmountMinor) &&
    Number.isSafeInteger(goal.currentAmountMinor) &&
    goal.targetAmountMinor > 0 &&
    goal.currentAmountMinor >= 0;
  if (!isValid) {
    throw new InvalidGoalError();
  }
}
