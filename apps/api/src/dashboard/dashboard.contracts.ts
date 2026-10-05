import { z } from 'zod';

export const moneySchema = z.object({ minor: z.number(), text: z.string() });
export const ratioSchema = z.object({ basisPoints: z.number(), text: z.string() });

const periodSchema = z.object({ start: z.string(), end: z.string() });

const comparisonSchema = z.object({
  current: moneySchema,
  previous: moneySchema,
  difference: moneySchema,
  change: ratioSchema.nullable(),
  direction: z.enum(['INCREASE', 'DECREASE', 'UNCHANGED']),
});

export const monthOptionSchema = z.object({ key: z.string(), label: z.string() });

export const monthSchema = monthOptionSchema.extend({
  period: periodSchema,
  asOf: z.string(),
  isComplete: z.boolean(),
});

const memberAmountSchema = z.object({
  member: z.string(),
  total: moneySchema,
  share: ratioSchema.nullable(),
});

const categoryAmountSchema = z.object({
  category: z.string(),
  isTopLevel: z.boolean(),
  total: moneySchema,
  share: ratioSchema.nullable(),
});

const categoryChangeSchema = comparisonSchema.extend({ category: z.string() });

const budgetSchema = z.object({
  category: z.string(),
  limit: moneySchema,
  spent: moneySchema,
  remaining: moneySchema,
  usage: ratioSchema,
  status: z.enum(['NOT_STARTED', 'ON_TRACK', 'NEAR_LIMIT', 'EXCEEDED']),
  projectedTotal: moneySchema,
  isProjectedOverLimit: z.boolean(),
  alertThresholdPercent: z.number(),
  byMember: z.array(memberAmountSchema),
});

const goalSchema = z.object({
  goal: z.string(),
  target: moneySchema,
  saved: moneySchema,
  remaining: moneySchema,
  progress: ratioSchema,
  state: z.enum(['COMPLETED', 'OVERDUE', 'IN_PROGRESS']),
  targetDate: z.string().nullable(),
  daysRemaining: z.number().nullable(),
  requiredMonthly: moneySchema.nullable(),
});

const forecastSchema = z.object({
  spent: moneySchema,
  projectedTotal: moneySchema,
  daysRemaining: z.number(),
  method: z.enum(['ACTUAL', 'HISTORICAL_REMAINDER', 'LINEAR_PACE']),
});

const outlookSchema = z.object({
  expectedIncome: moneySchema,
  projectedExpenses: moneySchema,
  projectedNet: moneySchema,
});

const findingSchema = z.object({
  kind: z.enum(['STRENGTH', 'CONCERN']),
  code: z.string(),
  statement: z.string(),
});

const signalSchema = z.object({
  type: z.string(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  title: z.string(),
  detail: z.string(),
  date: z.string().nullable(),
});

const balancesSchema = z.object({
  total: moneySchema,
  joint: moneySchema,
  byMember: z.array(z.object({ member: z.string(), total: moneySchema })),
});

const totalsSchema = z.object({
  income: moneySchema,
  expenses: moneySchema,
  net: moneySchema,
  savingsRate: ratioSchema.nullable(),
});

const recurringCommitmentSchema = z.object({
  merchant: z.string(),
  frequency: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY']),
  category: z.string(),
  typicalAmount: moneySchema,
  monthlyEquivalent: moneySchema,
  occurrences: z.number(),
  lastDate: z.string(),
  nextExpectedDate: z.string(),
});

export const sessionSchema = z.object({
  member: z.string(),
  household: z.string(),
  currency: z.string(),
  timezone: z.string(),
  today: z.string(),
  months: z.array(monthOptionSchema),
});

export const overviewSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      hasTransactions: z.boolean(),
      totals: totalsSchema,
      comparison: z
        .object({
          previousPeriod: periodSchema,
          expenses: comparisonSchema,
          income: comparisonSchema,
          net: comparisonSchema,
          previousSavingsRate: ratioSchema.nullable(),
        })
        .nullable(),
      topCategories: z.array(categoryAmountSchema.omit({ isTopLevel: true })),
      spendingByMember: z.array(
        z.object({
          member: z.string(),
          spent: moneySchema,
          spendingShare: ratioSchema.nullable(),
          income: moneySchema,
        }),
      ),
      budgets: z.array(budgetSchema),
      forecast: forecastSchema.nullable(),
      recurringMonthlyEquivalent: moneySchema,
      recurringCount: z.number(),
      balances: balancesSchema.nullable(),
      findings: z.array(findingSchema),
    }),
  ),
});

export const spendingSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      total: moneySchema,
      transactionCount: z.number(),
      comparison: comparisonSchema.nullable(),
      previousPeriod: periodSchema.nullable(),
      byCategory: z.array(categoryAmountSchema),
      byMember: z.array(memberAmountSchema),
      byAccount: z.array(
        z.object({ account: z.string(), total: moneySchema, share: ratioSchema.nullable() }),
      ),
      categoryIncreases: z.array(categoryChangeSchema),
      categoryDecreases: z.array(categoryChangeSchema),
      largestExpenses: z.array(
        z.object({
          date: z.string(),
          amount: moneySchema,
          merchant: z.string().nullable(),
          category: z.string(),
          member: z.string(),
          account: z.string(),
        }),
      ),
    }),
  ),
});

export const incomeSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      total: moneySchema,
      transactionCount: z.number(),
      comparison: comparisonSchema.nullable(),
      previousPeriod: periodSchema.nullable(),
      byCategory: z.array(categoryAmountSchema),
      byMember: z.array(memberAmountSchema),
    }),
  ),
});

export const budgetsSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      budgets: z.array(budgetSchema),
      forecast: forecastSchema.nullable(),
    }),
  ),
});

export const goalsSchema = z.object({
  month: monthSchema,
  currencies: z.array(z.object({ currency: z.string(), goals: z.array(goalSchema) })),
});

export const outlookViewSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      forecast: forecastSchema.nullable(),
      outlook: outlookSchema.nullable(),
      actual: totalsSchema,
      budgetsProjectedOverLimit: z.array(
        budgetSchema.pick({ category: true, limit: true, projectedTotal: true }),
      ),
      recurring: z.object({
        monthlyEquivalent: moneySchema,
        commitments: z.array(recurringCommitmentSchema),
      }),
    }),
  ),
});

export const signalsSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      insights: z.array(signalSchema),
      anomalies: z.array(signalSchema),
    }),
  ),
});

export const notificationSchema = z.object({
  key: z.string(),
  type: z.string(),
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'SUPPRESSED']),
  title: z.string(),
  detail: z.string(),
  currency: z.string(),
  period: z.string(),
  detectedAt: z.string(),
  notifiedAt: z.string().nullable(),
  isRead: z.boolean(),
});

export const notificationsSchema = z.object({
  notifications: z.array(notificationSchema),
});

export const reviewSchema = z.object({
  month: monthSchema,
  source: z.enum(['AI', 'DETERMINISTIC']),
  currencies: z.array(z.string()),
  summary: z.string(),
  strengths: z.array(z.string()),
  concerns: z.array(z.string()),
  recommendations: z.array(z.string()),
  priorities: z.array(z.string()),
});

const optionSchema = z.object({ key: z.string(), name: z.string() });

export const transactionsSchema = z.object({
  month: monthSchema,
  page: z.number(),
  pageCount: z.number(),
  total: z.number(),
  filters: z.object({
    types: z.array(z.string()),
    categories: z.array(optionSchema),
    accounts: z.array(optionSchema),
    members: z.array(optionSchema),
  }),
  transactions: z.array(
    z.object({
      date: z.string(),
      type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
      amount: moneySchema,
      currency: z.string(),
      merchant: z.string().nullable(),
      description: z.string().nullable(),
      category: z.string().nullable(),
      account: z.string(),
      transferAccount: z.string().nullable(),
      member: z.string(),
      expenseScope: z.enum(['HOUSEHOLD', 'INDIVIDUAL']),
      source: z.string(),
    }),
  ),
});

export const accountsSchema = z.object({
  today: z.string(),
  accounts: z.array(
    z.object({
      name: z.string(),
      type: z.enum(['BANK', 'CASH', 'CREDIT_CARD', 'SAVINGS']),
      currency: z.string(),
      owner: z.string(),
      isJoint: z.boolean(),
      balance: moneySchema,
    }),
  ),
  totals: z.array(balancesSchema.extend({ currency: z.string() })),
  members: z.array(z.object({ name: z.string() })),
});

export type Money = z.infer<typeof moneySchema>;
export type Ratio = z.infer<typeof ratioSchema>;
export type MonthView = z.infer<typeof monthSchema>;
export type MonthOption = z.infer<typeof monthOptionSchema>;
export type SessionView = z.infer<typeof sessionSchema>;
export type OverviewView = z.infer<typeof overviewSchema>;
export type SpendingView = z.infer<typeof spendingSchema>;
export type IncomeView = z.infer<typeof incomeSchema>;
export type BudgetsView = z.infer<typeof budgetsSchema>;
export type GoalsView = z.infer<typeof goalsSchema>;
export type OutlookView = z.infer<typeof outlookViewSchema>;
export type NotificationsView = z.infer<typeof notificationsSchema>;
export type NotificationView = z.infer<typeof notificationSchema>;
export type SignalsView = z.infer<typeof signalsSchema>;
export type ReviewView = z.infer<typeof reviewSchema>;
export type TransactionsView = z.infer<typeof transactionsSchema>;
export type AccountsView = z.infer<typeof accountsSchema>;
export type Comparison = z.infer<typeof comparisonSchema>;
export type BudgetView = z.infer<typeof budgetSchema>;
export type GoalView = z.infer<typeof goalSchema>;
export type SignalView = z.infer<typeof signalSchema>;
export type FindingView = z.infer<typeof findingSchema>;
