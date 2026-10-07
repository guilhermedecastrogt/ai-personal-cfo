import type {
  AccountsView,
  BudgetEditView,
  BudgetView,
  BudgetsView,
  Comparison,
  CompareView,
  EvolutionView,
  HouseholdDetailView,
  HouseholdsOverviewView,
  GoalEditView,
  MemberView,
  MembersView,
  GoalsView,
  IncomeView,
  Money,
  MonthView,
  NotificationsView,
  OutlookView,
  OverviewView,
  Ratio,
  RecurringView,
  ReviewView,
  SessionView,
  SignalsView,
  SpendingView,
  TransactionEditView,
  TransactionsView,
} from '@/lib/contracts';

export function eur(text: string, minor = 0): Money {
  return { minor, text: `€${text}` };
}

export function share(text: string, basisPoints: number): Ratio {
  return { basisPoints, text };
}

export const OCTOBER: MonthView = {
  key: '2026-10',
  label: 'October 2026',
  period: { start: '2026-10-01', end: '2026-10-31' },
  asOf: '2026-10-20',
  isComplete: false,
};

export const SEPTEMBER: MonthView = {
  key: '2026-09',
  label: 'September 2026',
  period: { start: '2026-09-01', end: '2026-09-30' },
  asOf: '2026-09-30',
  isComplete: true,
};

export function comparison(
  current: string,
  previous: string,
  direction: Comparison['direction'],
): Comparison {
  return {
    current: eur(current),
    previous: eur(previous),
    difference: eur('90.00'),
    change: share('4.23%', 423),
    direction,
  };
}

export const RESTAURANTS_BUDGET: BudgetView = {
  category: 'Restaurants',
  limit: eur('150.00', 15000),
  spent: eur('180.00', 18000),
  remaining: { minor: -3000, text: '-€30.00' },
  usage: share('120%', 12000),
  status: 'EXCEEDED',
  projectedTotal: eur('210.00', 21000),
  isProjectedOverLimit: false,
  alertThresholdPercent: 80,
  byMember: [
    { member: 'Member A', total: eur('0.00', 0), share: share('0%', 0) },
    { member: 'Member C', total: eur('180.00', 18000), share: share('100%', 10000) },
  ],
};

export const SESSION: SessionView = {
  locale: 'en',
  member: 'Member A',
  household: 'Demo Household',
  currency: 'EUR',
  timezone: 'Europe/Dublin',
  today: '2026-10-20',
  isPlatformAdmin: false,
  months: [
    { key: '2026-10', label: 'October 2026' },
    { key: '2026-09', label: 'September 2026' },
    { key: '2026-08', label: 'August 2026' },
  ],
};

type OverviewEntry = OverviewView['currencies'][number];

export const EUR_OVERVIEW: OverviewEntry = {
  currency: 'EUR',
  hasTransactions: true,
  totals: {
    income: eur('3,000.00', 300000),
    expenses: eur('2,220.00', 222000),
    net: eur('780.00', 78000),
    savingsRate: share('26%', 2600),
  },
  comparison: {
    previousPeriod: { start: '2026-09-01', end: '2026-09-20' },
    expenses: comparison('2,220.00', '2,130.00', 'INCREASE'),
    income: comparison('3,000.00', '3,000.00', 'UNCHANGED'),
    net: comparison('780.00', '870.00', 'DECREASE'),
    previousSavingsRate: share('29%', 2900),
  },
  topCategories: [
    { category: 'Housing', total: eur('1,800.00', 180000), share: share('81.08%', 8108) },
    { category: 'Food', total: eur('420.00', 42000), share: share('18.92%', 1892) },
  ],
  spendingByMember: [
    {
      member: 'Member A',
      spent: eur('2,040.00'),
      spendingShare: share('91.89%', 9189),
      income: eur('3,000.00'),
    },
    {
      member: 'Member C',
      spent: eur('180.00'),
      spendingShare: share('8.11%', 811),
      income: eur('0.00'),
    },
  ],
  budgets: [RESTAURANTS_BUDGET],
  forecast: {
    spent: eur('2,220.00', 222000),
    projectedTotal: eur('2,460.00', 246000),
    daysRemaining: 11,
    method: 'HISTORICAL_REMAINDER',
  },
  recurringMonthlyEquivalent: eur('2,040.00', 204000),
  recurringCount: 2,
  balances: {
    total: eur('3,110.00', 311000),
    joint: eur('2,610.00', 261000),
    byMember: [{ member: 'Member B', total: eur('500.00', 50000) }],
  },
  findings: [
    {
      kind: 'STRENGTH',
      code: 'POSITIVE_CASH_FLOW',
      statement: 'Income exceeded spending by €780.00.',
    },
    {
      kind: 'CONCERN',
      code: 'BUDGET_EXCEEDED',
      statement: 'The Restaurants budget of €150.00 is exceeded, with €180.00 spent (120%).',
    },
  ],
};

export const BRL_OVERVIEW: OverviewEntry = {
  ...EUR_OVERVIEW,
  currency: 'BRL',
  totals: {
    income: { minor: 0, text: 'R$0.00' },
    expenses: { minor: 50000, text: 'R$500.00' },
    net: { minor: -50000, text: '-R$500.00' },
    savingsRate: null,
  },
  comparison: null,
  budgets: [],
  findings: [],
  balances: null,
  forecast: null,
  topCategories: [
    { category: 'Food', total: { minor: 50000, text: 'R$500.00' }, share: share('100%', 10000) },
  ],
  spendingByMember: [],
};

export const EMPTY_OVERVIEW: OverviewEntry = {
  currency: 'EUR',
  hasTransactions: false,
  totals: { income: eur('0.00'), expenses: eur('0.00'), net: eur('0.00'), savingsRate: null },
  comparison: null,
  topCategories: [],
  spendingByMember: [],
  budgets: [],
  forecast: null,
  recurringMonthlyEquivalent: eur('0.00'),
  recurringCount: 0,
  balances: null,
  findings: [],
};

export function overview(
  currencies: OverviewEntry[] = [EUR_OVERVIEW],
  month = OCTOBER,
): OverviewView {
  return { month, currencies };
}

export const SPENDING: SpendingView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      total: eur('2,220.00', 222000),
      transactionCount: 3,
      comparison: comparison('2,220.00', '2,130.00', 'INCREASE'),
      previousPeriod: { start: '2026-09-01', end: '2026-09-20' },
      byCategory: [
        {
          category: 'Housing',
          isTopLevel: true,
          total: eur('1,800.00'),
          share: share('81.08%', 8108),
        },
        {
          category: 'Rent',
          isTopLevel: false,
          total: eur('1,800.00'),
          share: share('81.08%', 8108),
        },
        { category: 'Food', isTopLevel: true, total: eur('420.00'), share: share('18.92%', 1892) },
      ],
      byMember: [{ member: 'Member A', total: eur('2,040.00'), share: share('91.89%', 9189) }],
      byAccount: [
        { account: 'Joint Account', total: eur('2,220.00'), share: share('100%', 10000) },
      ],
      categoryIncreases: [
        { category: 'Restaurants', ...comparison('180.00', '90.00', 'INCREASE') },
      ],
      categoryDecreases: [],
      largestExpenses: [
        {
          date: '2026-10-01',
          amount: eur('1,800.00', 180000),
          merchant: 'Landlord',
          category: 'Rent',
          member: 'Member A',
          account: 'Joint Account',
        },
      ],
      composition: [
        {
          category: 'Housing',
          isOther: false,
          total: eur('1,800.00', 180000),
          share: share('81.08%', 8108),
          offset: share('0%', 0),
        },
        {
          category: 'Food',
          isOther: false,
          total: eur('420.00', 42000),
          share: share('18.92%', 1892),
          offset: share('81.08%', 8108),
        },
      ],
    },
  ],
};

export const INCOME: IncomeView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      total: eur('3,000.00', 300000),
      transactionCount: 1,
      comparison: comparison('3,000.00', '3,000.00', 'UNCHANGED'),
      previousPeriod: { start: '2026-09-01', end: '2026-09-20' },
      byCategory: [
        {
          category: 'Salary',
          isTopLevel: true,
          total: eur('3,000.00'),
          share: share('100%', 10000),
        },
      ],
      byMember: [{ member: 'Member A', total: eur('3,000.00'), share: share('100%', 10000) }],
    },
  ],
};

export const BUDGETS: BudgetsView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      budgets: [
        {
          key: 'budget-key-restaurants',
          pace: { elapsed: share('64.52%', 6452), status: 'FASTER' },
          ...RESTAURANTS_BUDGET,
        },
      ],
      forecast: EUR_OVERVIEW.forecast,
    },
  ],
  options: {
    categories: [{ key: 'category-key-restaurants', name: 'Restaurants' }],
    currencies: ['EUR'],
    periods: ['WEEKLY', 'MONTHLY', 'YEARLY'],
    defaultCurrency: 'EUR',
    defaultStartsOn: '2026-10-01',
  },
};

export const GOALS: GoalsView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      goals: [
        {
          key: 'goal-key-summer-trip',
          goal: 'Summer Trip',
          target: eur('1,000.00', 100000),
          saved: eur('620.00', 62000),
          remaining: eur('380.00', 38000),
          progress: share('62%', 6200),
          state: 'IN_PROGRESS',
          targetDate: '2027-06-30',
          daysRemaining: 253,
          requiredMonthly: eur('45.68', 4568),
        },
      ],
    },
  ],
  options: {
    types: ['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS'],
    currencies: ['EUR'],
    defaultCurrency: 'EUR',
  },
};

export const OUTLOOK: OutlookView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      forecast: EUR_OVERVIEW.forecast,
      outlook: {
        expectedIncome: eur('3,000.00', 300000),
        projectedExpenses: eur('2,460.00', 246000),
        projectedNet: eur('540.00', 54000),
      },
      actual: EUR_OVERVIEW.totals,
      budgetsProjectedOverLimit: [
        { category: 'Groceries', limit: eur('300.00'), projectedTotal: eur('340.00') },
      ],
      recurring: {
        monthlyEquivalent: eur('1,817.99', 181799),
        commitments: [
          {
            merchant: 'Landlord',
            frequency: 'MONTHLY',
            category: 'Rent',
            typicalAmount: eur('1,800.00', 180000),
            monthlyEquivalent: eur('1,800.00', 180000),
            occurrences: 4,
            lastDate: '2026-10-01',
            nextExpectedDate: '2026-10-31',
          },
        ],
      },
    },
  ],
};

export const SIGNALS: SignalsView = {
  month: OCTOBER,
  currencies: [
    {
      currency: 'EUR',
      insights: [
        {
          type: 'BUDGET_EXCEEDED',
          severity: 'HIGH',
          title: 'Restaurants budget exceeded',
          detail: '€180.00 of €150.00 spent (120%).',
          date: null,
        },
      ],
      anomalies: [
        {
          type: 'UNUSUALLY_LARGE_TRANSACTION',
          severity: 'MEDIUM',
          title: 'Unusually large Restaurants expense',
          detail: '€240.00 at Tasting Menu, against a usual €32.00.',
          date: '2026-10-14',
        },
      ],
    },
  ],
};

export const REVIEW: ReviewView = {
  month: OCTOBER,
  source: 'DETERMINISTIC',
  currencies: ['EUR'],
  summary:
    'For 2026-10-01 to 2026-10-31, income was €3,000.00 and spending was €2,220.00, leaving €780.00.',
  strengths: ['Income exceeded spending by €780.00.'],
  concerns: ['The Restaurants budget of €150.00 is exceeded, with €180.00 spent (120%).'],
  recommendations: ['Hold back on Restaurants for the rest of the period, or adjust the budget.'],
  priorities: ['Hold back on Restaurants for the rest of the period, or adjust the budget.'],
};

export const TRANSACTIONS: TransactionsView = {
  month: OCTOBER,
  range: null,
  sort: 'date_desc',
  page: 1,
  pageCount: 2,
  total: 61,
  filters: {
    types: ['EXPENSE', 'INCOME', 'TRANSFER'],
    categories: [{ key: 'category-key-food', name: 'Food' }],
    accounts: [{ key: 'account-key-joint', name: 'Joint Account' }],
    members: [{ key: 'member-key-a', name: 'Member A' }],
  },
  transactions: [
    {
      key: 'transaction-key-bistro',
      date: '2026-10-12',
      type: 'EXPENSE',
      amount: eur('180.00', 18000),
      currency: 'EUR',
      merchant: 'Bistro',
      description: null,
      category: 'Restaurants',
      account: 'Joint Account',
      transferAccount: null,
      member: 'Member C',
      expenseScope: 'INDIVIDUAL',
      source: 'WHATSAPP_TEXT',
    },
    {
      key: 'transaction-key-transfer',
      date: '2026-10-02',
      type: 'TRANSFER',
      amount: eur('500.00', 50000),
      currency: 'EUR',
      merchant: null,
      description: null,
      category: null,
      account: 'Joint Account',
      transferAccount: 'Savings',
      member: 'Member A',
      expenseScope: 'HOUSEHOLD',
      source: 'MANUAL',
    },
  ],
};

export const ACCOUNTS: AccountsView = {
  today: '2026-10-20',
  accounts: [
    {
      name: 'Joint Account',
      type: 'BANK',
      currency: 'EUR',
      owner: 'Joint',
      isJoint: true,
      balance: eur('2,610.00', 261000),
    },
    {
      name: 'Personal',
      type: 'BANK',
      currency: 'EUR',
      owner: 'Member B',
      isJoint: false,
      balance: eur('500.00', 50000),
    },
    {
      name: 'Reais',
      type: 'BANK',
      currency: 'BRL',
      owner: 'Member A',
      isJoint: false,
      balance: { minor: -50000, text: '-R$500.00' },
    },
  ],
  totals: [
    {
      currency: 'BRL',
      total: { minor: -50000, text: '-R$500.00' },
      joint: { minor: 0, text: 'R$0.00' },
      byMember: [],
    },
    {
      currency: 'EUR',
      total: eur('3,110.00', 311000),
      joint: eur('2,610.00', 261000),
      byMember: [{ member: 'Member B', total: eur('500.00', 50000) }],
    },
  ],
  members: [{ name: 'Member A' }, { name: 'Member B' }, { name: 'Member C' }],
};

export const NOTIFICATIONS: NotificationsView = {
  notifications: [
    {
      key: 'notification-1',
      type: 'BUDGET_EXCEEDED',
      severity: 'HIGH',
      status: 'SENT',
      title: 'Restaurants budget exceeded',
      detail: '€180.00 of €150.00 spent (120%).',
      currency: 'EUR',
      period: '2026-10',
      detectedAt: '2026-10-20T12:00:00.000Z',
      notifiedAt: '2026-10-20T12:00:00.000Z',
      isRead: false,
    },
    {
      key: 'notification-2',
      type: 'RECURRING_EXPENSE_DUE',
      severity: 'LOW',
      status: 'SUPPRESSED',
      title: 'Streaming is expected soon',
      detail: 'Usually €17.99, expected around 2026-10-22.',
      currency: 'EUR',
      period: '2026-10',
      detectedAt: '2026-10-19T09:00:00.000Z',
      notifiedAt: null,
      isRead: true,
    },
  ],
};

const PAYERS = [
  { member: 'Member A', occurrences: 4 },
  { member: 'Member B', occurrences: 3 },
];

export const RECURRING: RecurringView = {
  today: '2026-10-20',
  sort: 'cost',
  currencies: [
    {
      currency: 'EUR',
      monthlyEquivalent: eur('1,826.98', 182698),
      annualEquivalent: eur('21,923.76', 2192376),
      upcoming: {
        withinDays: 14,
        total: eur('1,802.99', 180299),
        merchants: ['Cloud', 'Landlord'],
      },
      commitments: [
        {
          merchant: 'Landlord',
          frequency: 'MONTHLY',
          category: 'Rent',
          typicalAmount: eur('1,800.00', 180000),
          monthlyEquivalent: eur('1,800.00', 180000),
          annualEquivalent: eur('21,600.00', 2160000),
          occurrences: 6,
          firstDate: '2026-05-01',
          lastDate: '2026-10-01',
          nextExpectedDate: '2026-10-31',
          isNew: false,
          priceChange: null,
          payers: [{ member: 'Member A', occurrences: 6 }],
        },
        {
          merchant: 'Streaming',
          frequency: 'MONTHLY',
          category: 'Subscriptions',
          typicalAmount: eur('18.99', 1899),
          monthlyEquivalent: eur('18.99', 1899),
          annualEquivalent: eur('227.88', 22788),
          occurrences: 7,
          firstDate: '2026-04-15',
          lastDate: '2026-10-15',
          nextExpectedDate: '2026-11-14',
          isNew: false,
          priceChange: {
            direction: 'INCREASE',
            previousAmount: eur('15.99', 1599),
            currentAmount: eur('18.99', 1899),
            difference: eur('3.00', 300),
            change: share('18.76%', 1876),
            effectiveDate: '2026-09-15',
          },
          payers: PAYERS,
        },
        {
          merchant: 'Cloud',
          frequency: 'MONTHLY',
          category: 'Subscriptions',
          typicalAmount: eur('2.99', 299),
          monthlyEquivalent: eur('2.99', 299),
          annualEquivalent: eur('35.88', 3588),
          occurrences: 3,
          firstDate: '2026-07-22',
          lastDate: '2026-09-22',
          nextExpectedDate: '2026-10-22',
          isNew: true,
          priceChange: null,
          payers: [{ member: 'Member C', occurrences: 3 }],
        },
      ],
      stopped: [
        {
          merchant: 'Old Gym',
          frequency: 'MONTHLY',
          category: 'Health',
          typicalAmount: eur('35.00', 3500),
          monthlyEquivalent: eur('35.00', 3500),
          annualEquivalent: eur('420.00', 42000),
          occurrences: 5,
          firstDate: '2026-03-05',
          lastDate: '2026-07-05',
          missedDate: '2026-08-04',
          payers: [{ member: 'Member A', occurrences: 5 }],
        },
      ],
    },
  ],
};

export const TRANSACTION_EDIT: TransactionEditView = {
  key: 'transaction-key-bistro',
  version: '2026-10-12T19:30:00.000Z',
  type: 'EXPENSE',
  amount: '180.00',
  currency: 'EUR',
  date: '2026-10-12',
  merchant: 'Bistro',
  description: null,
  categoryKey: 'category-key-restaurants',
  memberKey: 'member-key-c',
  accountKey: 'account-key-joint',
  transferAccount: null,
  expenseScope: 'INDIVIDUAL',
  source: 'WHATSAPP_TEXT',
  options: {
    members: [
      { key: 'member-key-a', name: 'Member A' },
      { key: 'member-key-c', name: 'Member C' },
    ],
    accounts: [
      { key: 'account-key-joint', name: 'Joint Account', currency: 'EUR' },
      { key: 'account-key-real', name: 'Conta Real', currency: 'BRL' },
    ],
    categories: [
      { key: 'category-key-restaurants', name: 'Restaurants', kind: 'EXPENSE' },
      { key: 'category-key-salary', name: 'Salary', kind: 'INCOME' },
    ],
  },
};

export const BUDGET_EDIT: BudgetEditView = {
  key: 'budget-key-restaurants',
  version: '2026-10-01T08:00:00.000Z',
  categoryKey: 'category-key-restaurants',
  period: 'MONTHLY',
  limit: '150.00',
  currency: 'EUR',
  alertThresholdPercent: 80,
  startsOn: '2026-10-01',
  endsOn: null,
  options: BUDGETS.options,
};

export const GOAL_EDIT: GoalEditView = {
  key: 'goal-key-summer-trip',
  version: '2026-10-01T08:00:00.000Z',
  name: 'Summer Trip',
  type: 'TRAVEL',
  target: '1000.00',
  saved: '620.00',
  currency: 'EUR',
  targetDate: '2027-06-30',
  options: GOALS.options,
};

function evolutionMonth(
  key: string,
  label: string,
  shortLabel: string,
  amounts: { income: string; expenses: string; net: string; netMinor: number },
  bars: { income: number; expenses: number },
): EvolutionView['currencies'][number]['months'][number] {
  return {
    key,
    label,
    shortLabel,
    income: eur(amounts.income),
    expenses: eur(amounts.expenses),
    net: eur(amounts.net, amounts.netMinor),
    incomeBar: share(String(bars.income), bars.income),
    expensesBar: share(String(bars.expenses), bars.expenses),
  };
}

export const EVOLUTION: EvolutionView = {
  months: 6,
  currencies: [
    {
      currency: 'EUR',
      months: [
        evolutionMonth(
          '2026-09',
          'September 2026',
          'Sep 26',
          { income: '3,000.00', expenses: '3,200.00', net: '-200.00', netMinor: -20000 },
          { income: 9375, expenses: 10000 },
        ),
        evolutionMonth(
          '2026-10',
          'October 2026',
          'Oct 26',
          { income: '3,000.00', expenses: '2,220.00', net: '780.00', netMinor: 78000 },
          { income: 9375, expenses: 6938 },
        ),
      ],
    },
  ],
};

export const COMPARE: CompareView = {
  first: { key: '2026-09', label: 'September 2026' },
  second: { key: '2026-10', label: 'October 2026' },
  months: [
    { key: '2026-10', label: 'October 2026' },
    { key: '2026-09', label: 'September 2026' },
  ],
  currencies: [
    {
      currency: 'EUR',
      income: comparison('3,000.00', '3,000.00', 'UNCHANGED'),
      expenses: comparison('2,220.00', '2,130.00', 'INCREASE'),
      net: comparison('780.00', '870.00', 'DECREASE'),
      categories: [
        {
          category: 'Food',
          first: eur('330.00'),
          second: eur('420.00'),
          comparison: comparison('420.00', '330.00', 'INCREASE'),
          firstBar: share('78.57%', 7857),
          secondBar: share('100%', 10000),
        },
      ],
    },
  ],
};

export const MEMBERS: MembersView = {
  members: [
    { key: 'member-key-a', name: 'Member A' },
    { key: 'member-key-b', name: 'Member B' },
  ],
};

export const MEMBER: MemberView = {
  month: OCTOBER,
  member: { key: 'member-key-b', name: 'Member B' },
  members: MEMBERS.members,
  currencies: [
    {
      currency: 'EUR',
      spending: eur('180.00', 18000),
      income: eur('0.00'),
      transactionCount: 1,
      householdSpending: eur('2,220.00', 222000),
      shareOfHousehold: share('8.11%', 811),
      comparison: comparison('180.00', '90.00', 'INCREASE'),
      composition: [
        {
          category: 'Food',
          isOther: false,
          total: eur('180.00', 18000),
          share: share('100%', 10000),
          offset: share('0%', 0),
        },
      ],
      byCategory: [
        { category: 'Food', isTopLevel: true, total: eur('180.00'), share: share('100%', 10000) },
      ],
      largestExpenses: [
        {
          date: '2026-10-12',
          amount: eur('180.00', 18000),
          merchant: 'Bistro',
          category: 'Restaurants',
          member: 'Member B',
          account: 'Joint Account',
        },
      ],
    },
  ],
};

export const ADMIN_HOUSEHOLDS: HouseholdsOverviewView = {
  households: [
    {
      key: 'household-key-own',
      name: 'Demo Household',
      currency: 'EUR',
      timezone: 'Europe/Dublin',
      locale: 'en',
      memberCount: 3,
      adminCount: 1,
      isYours: true,
      createdOn: '2026-05-01',
    },
    {
      key: 'household-key-other',
      name: 'Other Household',
      currency: 'BRL',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      memberCount: 1,
      adminCount: 0,
      isYours: false,
      createdOn: '2026-10-07',
    },
  ],
  options: {
    locales: ['en', 'pt-BR'],
    currencies: ['BRL', 'EUR', 'USD'],
    defaultTimezone: 'America/Sao_Paulo',
  },
};

export const ADMIN_HOUSEHOLD: HouseholdDetailView = {
  key: 'household-key-other',
  name: 'Other Household',
  currency: 'BRL',
  timezone: 'America/Sao_Paulo',
  locale: 'pt-BR',
  createdOn: '2026-10-07',
  members: [
    {
      key: 'member-key-one',
      name: 'Person One',
      email: 'one@example.com',
      hasPassword: true,
      hasInvitation: false,
      isPlatformAdmin: true,
      isYou: false,
      whatsapp: [{ key: 'identity-key-one', phoneNumber: '+5511999990001' }],
    },
    {
      key: 'member-key-two',
      name: 'Person Two',
      email: null,
      hasPassword: false,
      hasInvitation: false,
      isPlatformAdmin: false,
      isYou: false,
      whatsapp: [],
    },
  ],
  options: { locales: ['en', 'pt-BR'] },
};
