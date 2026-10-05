export const GOAL_TYPES = ['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS'] as const;

export type GoalType = (typeof GOAL_TYPES)[number];
