import { DEFAULT_LOCALE, type Locale } from '../i18n/locale.js';
import { Injectable } from '@nestjs/common';
import { CfoService, type CurrencyAnalysis, type MonthlyAnalysis } from '../cfo/cfo.service.js';
import type { ReviewBudget } from '../cfo/analysis/monthly-review.js';
import { localeOf, presentResult, type NameDirectory } from '../cfo/context/result-description.js';
import { describeFindings } from '../cfo/explanation/deterministic-narrative.js';
import {
  HouseholdDirectoryService,
  type HouseholdDirectory,
  type NamedEntry,
} from '../directory/household-directory.service.js';
import { FinanceService, HouseholdNotFoundError } from '../finance/application/finance.service.js';
import type { CompositionSlice } from '../finance/domain/analytics/category-composition.js';
import {
  daysBetween,
  monthContaining,
  previousPeriod,
  type DateRange,
  type IsoDate,
} from '../finance/domain/period/period.js';
import type { RecurringCommitment } from '../finance/domain/recurring/recurring-summary.js';
import type { RequestContext } from '../households/request-context.js';
import { ProactiveCfoService } from '../proactive/proactive-cfo.service.js';
import {
  TransactionsService,
  type TransactionSearch,
  type TransactionSort,
} from '../transactions/transactions.service.js';
import { TRANSACTION_TYPES, type TransactionType } from '../transactions/transaction-vocabulary.js';
import {
  accountsSchema,
  budgetsSchema,
  compareSchema,
  evolutionSchema,
  memberSchema,
  membersSchema,
  goalsSchema,
  incomeSchema,
  outlookViewSchema,
  overviewSchema,
  reviewSchema,
  sessionSchema,
  notificationsSchema,
  recurringSchema,
  signalsSchema,
  spendingSchema,
  transactionsSchema,
  type AccountsView,
  type BudgetsView,
  type CompareView,
  type EvolutionView,
  type MemberView,
  type MembersView,
  type GoalsView,
  type IncomeView,
  type OutlookView,
  type OverviewView,
  type ReviewView,
  type SessionView,
  type NotificationsView,
  type RecurringSort,
  type RecurringView,
  type SignalsView,
  type SpendingView,
  type TransactionsView,
} from './dashboard.contracts.js';
import { budgetOptions, goalOptions } from './edit-options.js';
import { describeMonth, listMonths, selectMonth, type SelectedMonth } from './month-selection.js';
import { transactionsCsv } from './transactions-csv.js';
import {
  allSpendingLabel,
  describeAnomalies,
  describeInsights,
} from '../cfo/context/signal-descriptions.js';

export interface TransactionFilters {
  readonly month?: string | undefined;
  readonly type?: TransactionType | undefined;
  readonly category?: string | undefined;
  readonly account?: string | undefined;
  readonly member?: string | undefined;
  readonly q?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
  readonly sort?: TransactionSort | undefined;
  readonly page: number;
}

export interface TransactionExport {
  readonly filename: string;
  readonly content: string;
}

export class InvalidRangeError extends Error {
  constructor() {
    super('The date range is not valid');
    this.name = InvalidRangeError.name;
  }
}

const MAXIMUM_RANGE_IN_DAYS = 366;
const MAXIMUM_EXPORTED_TRANSACTIONS = 5_000;
export type EvolutionMonths = 6 | 12;

const TRANSACTIONS_PER_PAGE = 50;

type CommitmentOrder = (left: RecurringCommitment, right: RecurringCommitment) => number;

const RECURRING_ORDER: Record<RecurringSort, CommitmentOrder> = {
  cost: () => 0,
  next: (left, right) => left.nextExpectedDate.localeCompare(right.nextExpectedDate),
  name: (left, right) => left.merchant.localeCompare(right.merchant),
};

interface Analysed {
  readonly month: SelectedMonth;
  readonly analysis: MonthlyAnalysis;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly finance: FinanceService,
    private readonly cfo: CfoService,
    private readonly directories: HouseholdDirectoryService,
    private readonly transactions: TransactionsService,
    private readonly proactive: ProactiveCfoService,
  ) {}

  async session(context: RequestContext, instant: Date): Promise<SessionView> {
    const [profile, today, earliest] = await Promise.all([
      this.directories.profile(context.householdId),
      this.finance.currentDate(context.householdId, instant),
      this.transactions.earliestDate(context.householdId),
    ]);
    if (profile === undefined) {
      throw new HouseholdNotFoundError();
    }
    return sessionSchema.parse({
      member: context.memberName,
      household: profile.name,
      currency: profile.currency,
      timezone: profile.timezone,
      today,
      months: listMonths(earliest, today, profile.locale),
      locale: profile.locale,
    });
  }

  async overview(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<OverviewView> {
    const { month, analysis } = await this.analyse(context, monthKey, instant);
    return overviewSchema.parse({
      month,
      currencies: analysis.analyses.map(({ review, context: described }) =>
        presentResult(
          {
            currency: review.currency,
            hasTransactions: review.transactionCount > 0,
            totals: review.totals,
            comparison:
              review.comparison === null
                ? null
                : {
                    previousPeriod: review.comparison.previousPeriod,
                    expenses: review.comparison.expenses,
                    income: review.comparison.income,
                    net: review.comparison.net,
                    previousSavingsRateBasisPoints:
                      review.comparison.previousSavingsRateBasisPoints,
                  },
            topCategories: review.topCategories,
            spendingByMember: review.byMember,
            budgets: review.budgets.map(budgetScopeIn(analysis.directory)),
            forecast: review.forecast,
            recurringMonthlyEquivalentMinor: review.recurring.monthlyEquivalentMinor,
            recurringCount: review.recurring.commitments.length,
            balances: review.balances,
            findings: describeFindings(described, localeOf(analysis.directory)),
          },
          analysis.directory,
        ),
      ),
    });
  }

  async spending(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<SpendingView> {
    const { month, analysis } = await this.analyse(context, monthKey, instant);
    const currencies = await Promise.all(
      analysis.analyses.map(async (currency) => {
        const { snapshot, review } = currency;
        const [largest, composition] = await Promise.all([
          this.finance.largestExpenses(context.householdId, snapshot.period, {}, snapshot.currency),
          this.finance.spendingComposition(context.householdId, snapshot.period, snapshot.currency),
        ]);
        return presentResult(
          {
            ...flowOf(currency, 'spending'),
            comparison: review.comparison?.expenses ?? null,
            byAccount: snapshot.spending.byAccount,
            categoryIncreases: review.categoryIncreases,
            categoryDecreases: review.categoryDecreases,
            largestExpenses: largest.expenses,
            composition: composition.map(sliceIn(localeOf(analysis.directory))),
          },
          analysis.directory,
        );
      }),
    );
    return spendingSchema.parse({ month, currencies });
  }

  async income(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<IncomeView> {
    const { month, analysis } = await this.analyse(context, monthKey, instant);
    return incomeSchema.parse({
      month,
      currencies: analysis.analyses.map((currency) =>
        presentResult(
          { ...flowOf(currency, 'income'), comparison: currency.review.comparison?.income ?? null },
          analysis.directory,
        ),
      ),
    });
  }

  async budgets(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<BudgetsView> {
    const [{ month, analysis }, directory, currency] = await Promise.all([
      this.analyse(context, monthKey, instant),
      this.directories.load(context.householdId),
      this.householdCurrency(context),
    ]);
    const paces = new Map(
      (await this.finance.budgetPaces(context.householdId, month.asOf)).map((pace) => [
        pace.budgetId,
        presentResult(
          { elapsedBasisPoints: pace.elapsedBasisPoints, status: pace.pace },
          analysis.directory,
        ),
      ]),
    );
    return budgetsSchema.parse({
      month,
      currencies: analysis.analyses.map(({ review }) =>
        withRowExtras(
          presentResult(
            {
              currency: review.currency,
              budgets: review.budgets.map(budgetScopeIn(analysis.directory)),
              forecast: review.forecast,
            },
            analysis.directory,
          ),
          'budgets',
          review.budgets.map((budget) => ({
            key: budget.budgetId,
            pace: paces.get(budget.budgetId) ?? null,
          })),
        ),
      ),
      options: budgetOptions(directory, currency, month.period.start),
    });
  }

  async goals(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<GoalsView> {
    const [{ month, analysis }, directory, currency] = await Promise.all([
      this.analyse(context, monthKey, instant),
      this.directories.load(context.householdId),
      this.householdCurrency(context),
    ]);
    return goalsSchema.parse({
      month,
      options: goalOptions(directory, currency),
      currencies: analysis.analyses.map(({ review }) =>
        withRowKeys(
          presentResult(
            {
              currency: review.currency,
              goals: review.goals.map((goal) => ({
                goalId: goal.goalId,
                targetMinor: goal.targetMinor,
                savedMinor: goal.currentMinor,
                remainingMinor: goal.remainingMinor,
                progressBasisPoints: goal.progressBasisPoints,
                state: goal.state,
                targetDate: goal.targetDate,
                daysRemaining: goal.daysRemaining,
                requiredMonthlyMinor: goal.requiredMonthlyMinor,
              })),
            },
            analysis.directory,
          ),
          'goals',
          review.goals.map((goal) => goal.goalId),
        ),
      ),
    });
  }

  async outlook(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<OutlookView> {
    const { month, analysis } = await this.analyse(context, monthKey, instant);
    return outlookViewSchema.parse({
      month,
      currencies: analysis.analyses.map(({ review }) =>
        presentResult(
          {
            currency: review.currency,
            forecast: review.forecast,
            outlook: review.outlook,
            actual: review.totals,
            budgetsProjectedOverLimit: review.budgets
              .filter((budget) => budget.isProjectedOverLimit)
              .map(budgetScopeIn(analysis.directory)),
            recurring: review.recurring,
          },
          analysis.directory,
        ),
      ),
    });
  }

  async signals(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<SignalsView> {
    const { month, analysis } = await this.analyse(context, monthKey, instant);
    return signalsSchema.parse({
      month,
      currencies: analysis.analyses.map(({ review }) => ({
        currency: review.currency,
        insights: describeInsights(review.insights, analysis.directory),
        anomalies: describeAnomalies(review.anomalies, analysis.directory),
      })),
    });
  }

  async recurring(
    context: RequestContext,
    sort: RecurringSort,
    instant: Date,
  ): Promise<RecurringView> {
    const today = await this.finance.currentDate(context.householdId, instant);
    const [directory, summaries, upcoming] = await Promise.all([
      this.directories.load(context.householdId),
      this.finance.recurringCommitments(context.householdId, today),
      this.finance.upcomingRecurring(context.householdId, today),
    ]);
    const names = namesOf(directory);
    return recurringSchema.parse({
      today,
      sort,
      currencies: summaries.map((summary) => {
        const due = upcoming.find((entry) => entry.currency === summary.currency);
        return presentResult(
          {
            ...summary,
            commitments: [...summary.commitments].sort(RECURRING_ORDER[sort]),
            upcoming: {
              withinDays: due?.withinDays ?? 0,
              totalMinor: due?.totalMinor ?? 0,
              merchants: due?.upcoming.map((commitment) => commitment.merchant) ?? [],
            },
          },
          names,
        );
      }),
    });
  }

  async notifications(context: RequestContext): Promise<NotificationsView> {
    const recent = await this.proactive.recent(context.householdId);
    return notificationsSchema.parse({
      notifications: recent.map((notification) => ({
        key: notification.id,
        type: notification.type,
        severity: notification.severity,
        status: notification.status,
        title: notification.title,
        detail: notification.body,
        currency: notification.currency,
        period: notification.period,
        detectedAt: notification.lastDetectedAt.toISOString(),
        notifiedAt: notification.lastNotifiedAt?.toISOString() ?? null,
        isRead: notification.readAt !== null,
      })),
    });
  }

  markNotificationRead(
    context: RequestContext,
    notificationId: string,
    instant: Date,
  ): Promise<boolean> {
    return this.proactive.markRead(context.householdId, notificationId, instant);
  }

  async review(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<ReviewView> {
    const { month, today } = await this.monthOf(context, monthKey, instant);
    const result = await this.cfo.monthlyReview(context, { month: month.period, today });
    return reviewSchema.parse({
      month,
      source: result.narrativeSource,
      currencies: result.reviews.map((review) => review.currency),
      ...result.narrative,
    });
  }

  async transactionHistory(
    context: RequestContext,
    filters: TransactionFilters,
    instant: Date,
  ): Promise<TransactionsView> {
    const { month, directory, search, range } = await this.transactionSearch(
      context,
      filters,
      instant,
    );
    const found = await this.transactions.search(context.householdId, {
      ...search,
      limit: TRANSACTIONS_PER_PAGE,
      offset: (filters.page - 1) * TRANSACTIONS_PER_PAGE,
    });
    return transactionsSchema.parse({
      month,
      range,
      sort: search.sort,
      page: filters.page,
      pageCount: Math.max(Math.ceil(found.total / TRANSACTIONS_PER_PAGE), 1),
      total: found.total,
      filters: {
        types: TRANSACTION_TYPES,
        categories: directory.categories.map(toOption),
        accounts: directory.accounts.map(toOption),
        members: directory.members.map(toOption),
      },
      transactions: found.transactions.map((transaction) => ({
        key: transaction.id,
        ...(presentResult(
          {
            currency: transaction.currency,
            date: transaction.transactionDate,
            type: transaction.type,
            amountMinor: transaction.amountMinor,
            merchant: transaction.merchant,
            description: transaction.description,
            category:
              transaction.categoryId === null
                ? null
                : (namesOf(directory).categories.get(transaction.categoryId) ?? null),
            accountId: transaction.accountId,
            transferAccountId: transaction.transferAccountId,
            memberId: transaction.memberId,
            expenseScope: transaction.expenseScope,
            source: transaction.source,
          },
          namesOf(directory),
        ) as Record<string, unknown>),
      })),
    });
  }

  async exportTransactions(
    context: RequestContext,
    filters: TransactionFilters,
    instant: Date,
  ): Promise<TransactionExport> {
    const { directory, search, period } = await this.transactionSearch(context, filters, instant);
    const found = await this.transactions.search(context.householdId, {
      ...search,
      limit: MAXIMUM_EXPORTED_TRANSACTIONS,
      offset: 0,
    });
    const names = namesOf(directory);
    return {
      filename: `${EXPORT_NAMES[directory.locale]}-${period.start}-${period.end}.csv`,
      content: transactionsCsv(found.transactions, names, directory.locale),
    };
  }

  async evolution(
    context: RequestContext,
    months: EvolutionMonths,
    instant: Date,
  ): Promise<EvolutionView> {
    const today = await this.finance.currentDate(context.householdId, instant);
    const locale = context.locale ?? DEFAULT_LOCALE;
    const periods = recentMonths(today, months);
    const [series, directory] = await Promise.all([
      this.finance.cashFlowSeries(context.householdId, periods),
      this.directories.load(context.householdId),
    ]);
    return evolutionSchema.parse({
      months,
      currencies: series.map(({ currency, months: points }) => ({
        currency,
        months: points.map((point) => ({
          ...describeMonth(point.period, locale),
          ...(presentResult(
            {
              currency,
              incomeMinor: point.incomeMinor,
              expensesMinor: point.expensesMinor,
              netMinor: point.netMinor,
              incomeBarBasisPoints: point.incomeBarBasisPoints,
              expensesBarBasisPoints: point.expensesBarBasisPoints,
            },
            namesOf(directory),
          ) as Record<string, unknown>),
        })),
      })),
    });
  }

  async compare(
    context: RequestContext,
    firstKey: string | undefined,
    secondKey: string | undefined,
    instant: Date,
  ): Promise<CompareView> {
    const locale = context.locale ?? DEFAULT_LOCALE;
    const [today, directory, earliest] = await Promise.all([
      this.finance.currentDate(context.householdId, instant),
      this.directories.load(context.householdId),
      this.transactions.earliestDate(context.householdId),
    ]);
    const second = selectMonth(secondKey, today, locale);
    const first =
      firstKey === undefined
        ? selectMonth(describeMonth(previousMonthOf(second.period), locale).key, today, locale)
        : selectMonth(firstKey, today, locale);
    const comparisons = await this.finance.compareMonths(
      context.householdId,
      first.period,
      second.period,
    );
    const names = namesOf(directory);
    return compareSchema.parse({
      first: { key: first.key, label: first.label },
      second: { key: second.key, label: second.label },
      months: listMonths(earliest, today, locale),
      currencies: comparisons.map((comparison) =>
        presentResult(
          {
            currency: comparison.currency,
            income: comparison.income,
            expenses: comparison.expenses,
            net: comparison.net,
            categories: comparison.categories.map((category) => ({
              categoryId: category.categoryId,
              firstMinor: category.firstMinor,
              secondMinor: category.secondMinor,
              comparison: category.comparison,
              firstBarBasisPoints: category.firstBarBasisPoints,
              secondBarBasisPoints: category.secondBarBasisPoints,
            })),
          },
          names,
        ),
      ),
    });
  }

  async members(context: RequestContext): Promise<MembersView> {
    const directory = await this.directories.load(context.householdId);
    return membersSchema.parse({ members: directory.members.map(toOption) });
  }

  async member(
    context: RequestContext,
    memberKey: string,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<MemberView | undefined> {
    const [{ month }, directory] = await Promise.all([
      this.monthOf(context, monthKey, instant),
      this.directories.load(context.householdId),
    ]);
    const member = directory.members.find((entry) => entry.id === memberKey);
    if (member === undefined) {
      return undefined;
    }
    const activities = await this.finance.memberActivity(
      context.householdId,
      member.id,
      month.period,
    );
    const names = namesOf(directory);
    const topLevel = new Set(
      directory.categories.filter((category) => category.parentId === null).map((c) => c.id),
    );
    return memberSchema.parse({
      month,
      member: toOption(member),
      members: directory.members.map(toOption),
      currencies: activities.map((activity) =>
        presentResult(
          {
            currency: activity.currency,
            spendingMinor: activity.spending.totalMinor,
            incomeMinor: activity.income.totalMinor,
            transactionCount: activity.spending.transactionCount,
            householdSpendingMinor: activity.householdSpendingMinor,
            shareOfHouseholdBasisPoints: activity.shareOfHouseholdBasisPoints,
            comparison: activity.spendingComparison,
            composition: activity.composition.map(sliceIn(directory.locale)),
            byCategory: activity.spending.byCategory.map(
              ({ categoryId, totalMinor, shareBasisPoints }) => ({
                categoryId,
                isTopLevel: categoryId === null || topLevel.has(categoryId),
                totalMinor,
                shareBasisPoints,
              }),
            ),
            largestExpenses: activity.largestExpenses,
          },
          names,
        ),
      ),
    });
  }

  private async transactionSearch(
    context: RequestContext,
    filters: TransactionFilters,
    instant: Date,
  ): Promise<{
    month: SelectedMonth;
    directory: HouseholdDirectory;
    search: Omit<TransactionSearch, 'limit' | 'offset'> & { sort: TransactionSort };
    range: DateRange | null;
    period: DateRange;
  }> {
    const [{ month, today }, directory] = await Promise.all([
      this.monthOf(context, filters.month, instant),
      this.directories.load(context.householdId),
    ]);
    const range = rangeOf(filters, month, today);
    const period = range ?? month.period;
    const sort = filters.sort ?? 'date_desc';
    return {
      month,
      directory,
      range,
      period,
      search: {
        period,
        type: filters.type,
        memberId: keyWithin(directory.members, filters.member),
        accountId: keyWithin(directory.accounts, filters.account),
        categoryIds: categoriesWithin(directory, filters.category),
        text: filters.q,
        sort,
      },
    };
  }

  async accounts(context: RequestContext, instant: Date): Promise<AccountsView> {
    const [today, directory, balances] = await Promise.all([
      this.finance.currentDate(context.householdId, instant),
      this.directories.load(context.householdId),
      this.finance.accountBalances(context.householdId),
    ]);
    const names = namesOf(directory);
    const details = new Map(directory.accounts.map((account) => [account.id, account]));
    return accountsSchema.parse({
      today,
      accounts: balances.accounts.map((balance) =>
        presentResult(
          {
            currency: balance.currency,
            name: details.get(balance.accountId)?.name,
            type: details.get(balance.accountId)?.type,
            ownerMemberId: balance.ownerMemberId,
            isJoint: balance.ownerMemberId === null,
            balanceMinor: balance.balanceMinor,
          },
          names,
        ),
      ),
      totals: presentResult(balances.totals, names),
      members: directory.members.map((member) => ({ name: member.name })),
    });
  }

  private async analyse(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<Analysed> {
    const { month, today } = await this.monthOf(context, monthKey, instant);
    return {
      month,
      analysis: await this.cfo.monthlyAnalysis(context, { month: month.period, today }),
    };
  }

  private async householdCurrency(context: RequestContext): Promise<string> {
    const profile = await this.directories.profile(context.householdId);
    if (profile === undefined) {
      throw new HouseholdNotFoundError();
    }
    return profile.currency;
  }

  private async monthOf(
    context: RequestContext,
    monthKey: string | undefined,
    instant: Date,
  ): Promise<{ month: SelectedMonth; today: IsoDate }> {
    const today = await this.finance.currentDate(context.householdId, instant);
    return { month: selectMonth(monthKey, today, context.locale ?? DEFAULT_LOCALE), today };
  }
}

function flowOf({ snapshot, review }: CurrencyAnalysis, kind: 'spending' | 'income'): object {
  const flow = snapshot[kind];
  const topLevel = new Set(snapshot.topLevelCategoryIds);
  return {
    currency: snapshot.currency,
    totalMinor: flow.totalMinor,
    transactionCount: flow.transactionCount,
    previousPeriod: review.comparison?.previousPeriod ?? null,
    byCategory: flow.byCategory.map(({ categoryId, totalMinor, shareBasisPoints }) => ({
      categoryId,
      isTopLevel: categoryId === null || topLevel.has(categoryId),
      totalMinor,
      shareBasisPoints,
    })),
    byMember: flow.byMember,
  };
}

function budgetScopeIn(
  directory: NameDirectory,
): (budget: ReviewBudget) => Record<string, unknown> {
  const allSpending = allSpendingLabel(localeOf(directory));
  return (budget) => withBudgetScope(budget, allSpending);
}

function withBudgetScope(budget: ReviewBudget, allSpending: string): Record<string, unknown> {
  const { categoryId, ...rest } = budget;
  return categoryId === null ? { category: allSpending, ...rest } : { categoryId, ...rest };
}

function withRowKeys(presented: unknown, field: string, keys: readonly string[]): unknown {
  return withRowExtras(
    presented,
    field,
    keys.map((key) => ({ key })),
  );
}

function withRowExtras(
  presented: unknown,
  field: string,
  extras: readonly Record<string, unknown>[],
): unknown {
  const section = presented as Record<string, unknown>;
  const rows = section[field] as readonly Record<string, unknown>[];
  return { ...section, [field]: rows.map((row, index) => ({ ...extras[index], ...row })) };
}

const OTHER_CATEGORIES: Readonly<Record<Locale, string>> = {
  en: 'Others',
  'pt-BR': 'Outros',
};

function sliceIn(locale: Locale): (slice: CompositionSlice) => Record<string, unknown> {
  return ({ categoryId, isOther, ...rest }) =>
    isOther
      ? { category: OTHER_CATEGORIES[locale], isOther, ...rest }
      : { categoryId, isOther, ...rest };
}

const EXPORT_NAMES: Readonly<Record<Locale, string>> = {
  en: 'transactions',
  'pt-BR': 'movimentos',
};

function rangeOf(
  filters: TransactionFilters,
  month: SelectedMonth,
  today: IsoDate,
): DateRange | null {
  if (filters.from === undefined && filters.to === undefined) {
    return null;
  }
  const start = filters.from ?? month.period.start;
  const end = filters.to ?? today;
  if (start > end || daysBetween(start, end) >= MAXIMUM_RANGE_IN_DAYS) {
    throw new InvalidRangeError();
  }
  return { start, end };
}

function recentMonths(today: IsoDate, count: number): DateRange[] {
  const months: DateRange[] = [monthContaining(today)];
  while (months.length < count) {
    const [earliest] = months;
    if (earliest === undefined) {
      break;
    }
    months.unshift(previousMonthOf(earliest));
  }
  return months;
}

function previousMonthOf(period: DateRange): DateRange {
  return previousPeriod('MONTHLY', period);
}

function toOption(entry: NamedEntry): { key: string; name: string } {
  return { key: entry.id, name: entry.name };
}

function keyWithin(entries: readonly NamedEntry[], key: string | undefined): string | undefined {
  if (key === undefined) {
    return undefined;
  }
  return entries.find((entry) => entry.id === key)?.id ?? UNMATCHED_KEY;
}

function categoriesWithin(
  directory: HouseholdDirectory,
  key: string | undefined,
): string[] | undefined {
  if (key === undefined) {
    return undefined;
  }
  const selected = directory.categories.filter(
    (category) => category.id === key || category.parentId === key,
  );
  return selected.length === 0 ? [UNMATCHED_KEY] : selected.map((category) => category.id);
}

const UNMATCHED_KEY = '00000000-0000-0000-0000-000000000000';

function namesOf(directory: HouseholdDirectory): NameDirectory {
  const byId = (entries: readonly NamedEntry[]): Map<string, string> =>
    new Map(entries.map((entry) => [entry.id, entry.name]));
  return {
    members: byId(directory.members),
    categories: byId(directory.categories),
    accounts: byId(directory.accounts),
    goals: byId(directory.goals),
    locale: directory.locale,
  };
}
