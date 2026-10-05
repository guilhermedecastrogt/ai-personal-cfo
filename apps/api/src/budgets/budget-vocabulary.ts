export const BUDGET_PERIODS = ['WEEKLY', 'MONTHLY', 'YEARLY'] as const;

export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];
