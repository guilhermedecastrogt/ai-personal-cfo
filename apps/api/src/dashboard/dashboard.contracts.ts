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

const recurringPayerSchema = z.object({ member: z.string(), occurrences: z.number() });

const recurringDetailSchema = recurringCommitmentSchema.omit({ nextExpectedDate: true }).extend({
  annualEquivalent: moneySchema,
  firstDate: z.string(),
  payers: z.array(recurringPayerSchema),
});

export const activeRecurringSchema = recurringDetailSchema.extend({
  nextExpectedDate: z.string(),
  isNew: z.boolean(),
  priceChange: z
    .object({
      direction: z.enum(['INCREASE', 'DECREASE']),
      previousAmount: moneySchema,
      currentAmount: moneySchema,
      difference: moneySchema,
      change: ratioSchema.nullable(),
      effectiveDate: z.string(),
    })
    .nullable(),
});

export const stoppedRecurringSchema = recurringDetailSchema.extend({ missedDate: z.string() });

export const RECURRING_SORTS = ['cost', 'next', 'name'] as const;

export const recurringSchema = z.object({
  today: z.string(),
  sort: z.enum(RECURRING_SORTS),
  currencies: z.array(
    z.object({
      currency: z.string(),
      monthlyEquivalent: moneySchema,
      annualEquivalent: moneySchema,
      commitments: z.array(activeRecurringSchema),
      stopped: z.array(stoppedRecurringSchema),
      upcoming: z.object({
        withinDays: z.number(),
        total: moneySchema,
        merchants: z.array(z.string()),
      }),
    }),
  ),
});

export const sessionSchema = z.object({
  locale: z.enum(['en', 'pt-BR']),
  member: z.string(),
  household: z.string(),
  currency: z.string(),
  timezone: z.string(),
  today: z.string(),
  months: z.array(monthOptionSchema),
  isPlatformAdmin: z.boolean(),
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

const largestExpenseSchema = z.object({
  date: z.string(),
  amount: moneySchema,
  merchant: z.string().nullable(),
  category: z.string(),
  member: z.string(),
  account: z.string(),
});

const compositionSliceSchema = z.object({
  category: z.string(),
  isOther: z.boolean(),
  total: moneySchema,
  share: ratioSchema,
  offset: ratioSchema,
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
      largestExpenses: z.array(largestExpenseSchema),
      composition: z.array(compositionSliceSchema),
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

const optionSchema = z.object({ key: z.string(), name: z.string() });

export const budgetOptionsSchema = z.object({
  categories: z.array(optionSchema),
  currencies: z.array(z.string()),
  periods: z.array(z.enum(['WEEKLY', 'MONTHLY', 'YEARLY'])),
  defaultCurrency: z.string(),
  defaultStartsOn: z.string(),
});

export const goalOptionsSchema = z.object({
  types: z.array(z.enum(['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS'])),
  currencies: z.array(z.string()),
  defaultCurrency: z.string(),
});

export const budgetsSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      budgets: z.array(
        budgetSchema.extend({
          key: z.string(),
          pace: z
            .object({
              elapsed: ratioSchema,
              status: z.enum(['NOT_STARTED', 'FASTER', 'ON_PACE', 'SLOWER']),
            })
            .nullable(),
        }),
      ),
      forecast: forecastSchema.nullable(),
    }),
  ),
  options: budgetOptionsSchema,
});

export const goalsSchema = z.object({
  month: monthSchema,
  currencies: z.array(
    z.object({
      currency: z.string(),
      goals: z.array(goalSchema.extend({ key: z.string() })),
    }),
  ),
  options: goalOptionsSchema,
});

export const budgetEditSchema = z.object({
  key: z.string(),
  version: z.string(),
  categoryKey: z.string().nullable(),
  period: z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']),
  limit: z.string(),
  currency: z.string(),
  alertThresholdPercent: z.number(),
  startsOn: z.string(),
  endsOn: z.string().nullable(),
  options: budgetOptionsSchema,
});

export const goalEditSchema = z.object({
  key: z.string(),
  version: z.string(),
  name: z.string(),
  type: z.enum(['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS']),
  target: z.string(),
  saved: z.string(),
  currency: z.string(),
  targetDate: z.string().nullable(),
  options: goalOptionsSchema,
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

export const transactionsSchema = z.object({
  month: monthSchema,
  range: periodSchema.nullable(),
  sort: z.enum(['date_desc', 'date_asc', 'amount_desc', 'amount_asc']),
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
      key: z.string(),
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

export const transactionEditSchema = z.object({
  key: z.string(),
  version: z.string(),
  type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
  amount: z.string(),
  currency: z.string(),
  date: z.string(),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  categoryKey: z.string().nullable(),
  memberKey: z.string(),
  accountKey: z.string(),
  transferAccount: z.string().nullable(),
  expenseScope: z.enum(['HOUSEHOLD', 'INDIVIDUAL']),
  source: z.string(),
  options: z.object({
    members: z.array(optionSchema),
    accounts: z.array(optionSchema.extend({ currency: z.string() })),
    categories: z.array(optionSchema.extend({ kind: z.enum(['EXPENSE', 'INCOME']) })),
  }),
});

export const savedSchema = z.object({ key: z.string(), version: z.string() });

export const FIELD_ERROR_CODES = [
  'REQUIRED',
  'INVALID',
  'INVALID_AMOUNT',
  'UNKNOWN',
  'CURRENCY_MISMATCH',
  'KIND_MISMATCH',
  'NOT_ALLOWED',
  'DUPLICATE',
  'ENDS_BEFORE_START',
] as const;

export const fieldErrorSchema = z.object({
  field: z.string(),
  code: z.enum(FIELD_ERROR_CODES),
});

export const evolutionSchema = z.object({
  months: z.number(),
  currencies: z.array(
    z.object({
      currency: z.string(),
      months: z.array(
        z.object({
          key: z.string(),
          label: z.string(),
          shortLabel: z.string(),
          income: moneySchema,
          expenses: moneySchema,
          net: moneySchema,
          incomeBar: ratioSchema,
          expensesBar: ratioSchema,
        }),
      ),
    }),
  ),
});

export const compareSchema = z.object({
  first: monthOptionSchema,
  second: monthOptionSchema,
  months: z.array(monthOptionSchema),
  currencies: z.array(
    z.object({
      currency: z.string(),
      income: comparisonSchema,
      expenses: comparisonSchema,
      net: comparisonSchema,
      categories: z.array(
        z.object({
          category: z.string(),
          first: moneySchema,
          second: moneySchema,
          comparison: comparisonSchema,
          firstBar: ratioSchema,
          secondBar: ratioSchema,
        }),
      ),
    }),
  ),
});

export const membersSchema = z.object({ members: z.array(optionSchema) });

export const memberSchema = z.object({
  month: monthSchema,
  member: optionSchema,
  members: z.array(optionSchema),
  currencies: z.array(
    z.object({
      currency: z.string(),
      spending: moneySchema,
      income: moneySchema,
      transactionCount: z.number(),
      householdSpending: moneySchema,
      shareOfHousehold: ratioSchema.nullable(),
      comparison: comparisonSchema,
      composition: z.array(compositionSliceSchema),
      byCategory: z.array(categoryAmountSchema),
      largestExpenses: z.array(largestExpenseSchema),
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
export type RecurringView = z.infer<typeof recurringSchema>;
export type ActiveRecurringView = z.infer<typeof activeRecurringSchema>;
export type StoppedRecurringView = z.infer<typeof stoppedRecurringSchema>;
export type RecurringSort = (typeof RECURRING_SORTS)[number];
export type SignalsView = z.infer<typeof signalsSchema>;
export type ReviewView = z.infer<typeof reviewSchema>;
export type TransactionsView = z.infer<typeof transactionsSchema>;
export type AccountsView = z.infer<typeof accountsSchema>;
export type EvolutionView = z.infer<typeof evolutionSchema>;
export type CompareView = z.infer<typeof compareSchema>;
export type MembersView = z.infer<typeof membersSchema>;
export type MemberView = z.infer<typeof memberSchema>;
export type CompositionSliceView = z.infer<typeof compositionSliceSchema>;
export type TransactionSort = TransactionsView['sort'];
export type Comparison = z.infer<typeof comparisonSchema>;
export type BudgetView = z.infer<typeof budgetSchema>;
export type GoalView = z.infer<typeof goalSchema>;
export type BudgetRowView = BudgetsView['currencies'][number]['budgets'][number];
export type GoalRowView = GoalsView['currencies'][number]['goals'][number];
export type BudgetOptions = z.infer<typeof budgetOptionsSchema>;
export type GoalOptions = z.infer<typeof goalOptionsSchema>;
export type TransactionEditView = z.infer<typeof transactionEditSchema>;
export type BudgetEditView = z.infer<typeof budgetEditSchema>;
export type GoalEditView = z.infer<typeof goalEditSchema>;
export type SavedView = z.infer<typeof savedSchema>;
export type FieldError = z.infer<typeof fieldErrorSchema>;
export type FieldErrorCode = (typeof FIELD_ERROR_CODES)[number];
export type SignalView = z.infer<typeof signalSchema>;
export type FindingView = z.infer<typeof findingSchema>;
