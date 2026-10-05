import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../../accounts/accounts.repository.js';
import type { ReplyFacts } from '../../ai/ai-provider.js';
import type {
  FinancialIntent,
  FinancialQuestion,
} from '../../ai/interpretation/message-interpretation.schema.js';
import { CategoriesRepository } from '../../categories/categories.repository.js';
import { FinanceService, type PeriodFlow } from '../../finance/application/finance.service.js';
import { monthToDate, type DateRange, type IsoDate } from '../../finance/domain/period/period.js';
import { GoalsRepository } from '../../goals/goals.repository.js';
import { HouseholdsRepository } from '../../households/households.repository.js';
import type { RequestContext } from '../../households/request-context.js';
import { normalizeName, resolveMentionedAccount } from '../extraction/account-resolution.js';
import { resolvePeriodReference } from './period-reference.js';
import { describeResult, type NameDirectory } from './result-description.js';

export type QueryProblem =
  | 'UNRESOLVABLE_PERIOD'
  | 'UNKNOWN_CATEGORY'
  | 'UNKNOWN_MEMBER'
  | 'UNKNOWN_ACCOUNT'
  | 'AMBIGUOUS_ACCOUNT';

export type QueryOutcome =
  | {
      readonly status: 'ANSWERED';
      readonly intent: FinancialIntent;
      readonly result: unknown;
      readonly facts: ReplyFacts;
    }
  | {
      readonly status: 'NEEDS_CLARIFICATION';
      readonly reasons: readonly QueryProblem[];
      readonly facts: ReplyFacts;
    };

interface Filters {
  readonly period: DateRange;
  readonly categoryId: string | undefined;
  readonly memberId: string | undefined;
  readonly accountId: string | undefined;
}

interface Named {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class FinancialQueryService {
  constructor(
    private readonly finance: FinanceService,
    private readonly households: HouseholdsRepository,
    private readonly categories: CategoriesRepository,
    private readonly accounts: AccountsRepository,
    private readonly goals: GoalsRepository,
  ) {}

  async answer(
    context: RequestContext,
    question: FinancialQuestion,
    today: IsoDate,
  ): Promise<QueryOutcome> {
    const { householdId } = context;
    const [members, categories, accounts, goals] = await Promise.all([
      this.households.listMembers(householdId),
      this.categories.list(),
      this.accounts.list(householdId),
      this.goals.list(householdId),
    ]);
    const problems: QueryProblem[] = [];
    const period = resolvePeriodReference(question.period, today);
    if (period === undefined) {
      problems.push('UNRESOLVABLE_PERIOD');
    }
    const category = findByName(categories, question.category);
    if (question.category !== null && category === undefined) {
      problems.push('UNKNOWN_CATEGORY');
    }
    const memberId = this.resolveMember(context, question, members, problems);
    const account =
      question.account === null
        ? undefined
        : resolveMentionedAccount(question.account, accounts, context.memberId);
    if (account !== undefined && account.status !== 'RESOLVED') {
      problems.push(account.status === 'UNKNOWN' ? 'UNKNOWN_ACCOUNT' : 'AMBIGUOUS_ACCOUNT');
    }
    if (period === undefined || problems.length > 0) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasons: problems,
        facts: {
          reasons: problems,
          memberOptions: members.map((member) => member.name),
          categoryOptions: categories.map((option) => option.name),
          accountOptions: accounts.map((option) => option.name),
        },
      };
    }
    const result = await this.compute(householdId, question.intent, today, {
      period,
      categoryId: category?.id,
      memberId,
      accountId: account?.status === 'RESOLVED' ? account.account.id : undefined,
    });
    const directory: NameDirectory = {
      members: namesById(members),
      categories: namesById(categories),
      accounts: namesById(accounts),
      goals: namesById(goals),
    };
    return {
      status: 'ANSWERED',
      intent: question.intent,
      result,
      facts: { intent: question.intent, today, result: describeResult(result, directory) },
    };
  }

  private resolveMember(
    context: RequestContext,
    question: FinancialQuestion,
    members: readonly Named[],
    problems: QueryProblem[],
  ): string | undefined {
    if (question.memberScope === 'SENDER') {
      return context.memberId;
    }
    if (question.memberScope === 'HOUSEHOLD') {
      return undefined;
    }
    const member = findByName(members, question.memberName);
    if (member === undefined) {
      problems.push('UNKNOWN_MEMBER');
    }
    return member?.id;
  }

  private async compute(
    householdId: string,
    intent: FinancialIntent,
    today: IsoDate,
    filters: Filters,
  ): Promise<unknown> {
    switch (intent) {
      case 'SPENDING_TOTAL':
      case 'SPENDING_BY_CATEGORY':
      case 'SPENDING_BY_MEMBER':
      case 'SPENDING_BY_ACCOUNT':
        return focusFlow(await this.finance.spending(householdId, filters.period), intent, filters);
      case 'INCOME_TOTAL':
        return focusFlow(await this.finance.income(householdId, filters.period), intent, filters);
      case 'CASH_FLOW':
      case 'SAVINGS':
        return this.finance.cashFlow(householdId, filters.period);
      case 'BUDGET_STATUS':
        return (await this.finance.budgets(householdId, today)).filter(
          (budget) => filters.categoryId === undefined || budget.categoryId === filters.categoryId,
        );
      case 'GOAL_PROGRESS':
        return this.finance.goals(householdId, today);
      case 'SPENDING_TREND':
        return focusTrends(
          await this.finance.spendingTrends(householdId, monthToDate(today)),
          filters,
        );
      case 'RECURRING_EXPENSES':
        return this.finance.recurringExpenses(householdId, today);
      case 'ACCOUNT_BALANCE':
        return focusBalances(await this.finance.accountBalances(householdId), filters);
      case 'FORECAST':
        return this.finance.monthEndForecast(householdId, today);
      case 'INSIGHTS':
        return this.finance.insights(householdId, today);
    }
  }
}

function focusFlow(flow: PeriodFlow, intent: FinancialIntent, filters: Filters): unknown {
  const summary = {
    period: flow.period,
    currency: flow.currency,
    householdTotalMinor: flow.totalMinor,
  };
  const { categoryId, memberId, accountId } = filters;
  if (categoryId !== undefined) {
    const category = flow.byCategory.find((row) => row.categoryId === categoryId);
    const members = category?.byMember ?? [];
    return {
      ...summary,
      categoryId,
      categoryTotalMinor: category?.totalMinor ?? 0,
      categoryShareBasisPoints: category?.shareBasisPoints ?? null,
      ...(memberId === undefined
        ? { byMember: members }
        : {
            memberId,
            memberTotalMinor: members.find((row) => row.memberId === memberId)?.totalMinor ?? 0,
          }),
    };
  }
  if (memberId !== undefined) {
    const member = flow.byMember.find((row) => row.memberId === memberId);
    return {
      ...summary,
      memberId,
      memberTotalMinor: member?.totalMinor ?? 0,
      memberShareBasisPoints: member?.shareBasisPoints ?? null,
    };
  }
  if (accountId !== undefined) {
    const account = flow.byAccount.find((row) => row.accountId === accountId);
    return { ...summary, accountId, accountTotalMinor: account?.totalMinor ?? 0 };
  }
  switch (intent) {
    case 'SPENDING_BY_CATEGORY':
      return {
        ...summary,
        byCategory: flow.byCategory.map(({ categoryId: id, totalMinor, shareBasisPoints }) => ({
          categoryId: id,
          totalMinor,
          shareBasisPoints,
        })),
      };
    case 'SPENDING_BY_ACCOUNT':
      return { ...summary, byAccount: flow.byAccount };
    default:
      return { ...summary, byMember: flow.byMember };
  }
}

function focusTrends(
  trends: Awaited<ReturnType<FinanceService['spendingTrends']>>,
  filters: Filters,
): unknown {
  const { currency, currentPeriod, previousPeriod } = trends;
  if (filters.categoryId !== undefined) {
    const category = trends.byCategory.find((trend) => trend.categoryId === filters.categoryId);
    return { currency, currentPeriod, previousPeriod, category: category ?? null };
  }
  if (filters.memberId !== undefined) {
    const member = trends.byMember.find((trend) => trend.memberId === filters.memberId);
    return { currency, currentPeriod, previousPeriod, member: member ?? null };
  }
  return trends;
}

function focusBalances(
  balances: Awaited<ReturnType<FinanceService['accountBalances']>>,
  filters: Filters,
): unknown {
  return filters.accountId === undefined
    ? balances
    : { accounts: balances.accounts.filter((account) => account.accountId === filters.accountId) };
}

function findByName<Item extends Named>(
  items: readonly Item[],
  name: string | null,
): Item | undefined {
  if (name === null) {
    return undefined;
  }
  return items.find((item) => normalizeName(item.name) === normalizeName(name));
}

function namesById(items: readonly Named[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}
