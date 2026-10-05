import { Injectable } from '@nestjs/common';
import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { FinancialIntent } from '../../ai/interpretation/message-interpretation.schema.js';
import { describeResult, type NameDirectory } from '../../cfo/context/result-description.js';
import {
  HouseholdDirectoryService,
  type HouseholdDirectory,
  type NamedEntry,
} from '../../directory/household-directory.service.js';
import { FinanceService, type PeriodFlow } from '../../finance/application/finance.service.js';
import {
  contains,
  monthToDate,
  type DateRange,
  type IsoDate,
} from '../../finance/domain/period/period.js';
import type { RequestContext } from '../../households/request-context.js';
import type { QuestionFrame } from '../conversation-state.js';
import { normalizeName, resolveMentionedAccount } from '../extraction/account-resolution.js';
import { resolvePeriodReference } from './period-reference.js';

export type QueryIntent = Exclude<FinancialIntent, 'MONTHLY_REVIEW'>;

export type QueryFrame = QuestionFrame & { readonly intent: QueryIntent };

export function isQueryFrame(frame: QuestionFrame): frame is QueryFrame {
  return frame.intent !== 'MONTHLY_REVIEW';
}

export type QueryProblem =
  | 'NO_PREVIOUS_QUESTION'
  | 'UNRESOLVABLE_PERIOD'
  | 'UNKNOWN_CATEGORY'
  | 'UNKNOWN_MEMBER'
  | 'UNKNOWN_ACCOUNT'
  | 'AMBIGUOUS_ACCOUNT';

export type QueryOutcome =
  | {
      readonly status: 'ANSWERED';
      readonly intent: QueryIntent;
      readonly result: unknown;
      readonly facts: ReplyFacts;
      readonly frame: QuestionFrame;
    }
  | {
      readonly status: 'NEEDS_CLARIFICATION';
      readonly reasons: readonly QueryProblem[];
      readonly facts: ReplyFacts;
      readonly frame: QuestionFrame | null;
    };

interface Filters {
  readonly period: DateRange;
  readonly categoryId: string | undefined;
  readonly memberId: string | undefined;
  readonly accountId: string | undefined;
}

interface Resolution {
  readonly problems: QueryProblem[];
  readonly period: DateRange | undefined;
  readonly category: NamedEntry | undefined;
  readonly member: NamedEntry | undefined;
  readonly account: NamedEntry | undefined;
}

@Injectable()
export class FinancialQueryService {
  constructor(
    private readonly finance: FinanceService,
    private readonly directories: HouseholdDirectoryService,
  ) {}

  async answer(context: RequestContext, frame: QueryFrame, today: IsoDate): Promise<QueryOutcome> {
    const directory = await this.directories.load(context.householdId);
    const resolution = resolve(context, frame, directory, today);
    const resolvedFrame = canonicalFrame(frame, resolution);
    if (resolution.period === undefined || resolution.problems.length > 0) {
      return {
        status: 'NEEDS_CLARIFICATION',
        reasons: resolution.problems,
        frame: resolvedFrame,
        facts: {
          reasons: resolution.problems,
          memberOptions: directory.members.map((member) => member.name),
          categoryOptions: directory.categories.map((category) => category.name),
          accountOptions: directory.accounts.map((account) => account.name),
        },
      };
    }
    const result = await this.compute(context.householdId, frame, today, directory, {
      period: resolution.period,
      categoryId: resolution.category?.id,
      memberId: resolution.member?.id,
      accountId: resolution.account?.id,
    });
    return {
      status: 'ANSWERED',
      intent: frame.intent,
      result,
      frame: resolvedFrame,
      facts: { intent: frame.intent, today, result: describeResult(result, namesOf(directory)) },
    };
  }

  private async compute(
    householdId: string,
    frame: QueryFrame,
    today: IsoDate,
    directory: HouseholdDirectory,
    filters: Filters,
  ): Promise<unknown> {
    const { intent } = frame;
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
          await this.finance.spendingTrends(householdId, comparisonPeriod(frame, filters, today)),
          filters,
        );
      case 'SPENDING_CHANGE':
        return this.explainChange(householdId, frame, today, directory, filters);
      case 'LARGEST_EXPENSES':
        return this.finance.largestExpenses(householdId, filters.period, filters);
      case 'RECURRING_EXPENSES':
        return this.finance.recurringCommitments(householdId, today);
      case 'RECURRING_UPCOMING':
        return this.finance.upcomingRecurring(householdId, today);
      case 'RECURRING_CHANGES':
        return this.finance.recurringChanges(householdId, today);
      case 'ACCOUNT_BALANCE':
        return focusBalances(await this.finance.accountBalances(householdId), filters);
      case 'FORECAST':
        return this.finance.monthEndForecast(householdId, today);
      case 'INSIGHTS':
        return this.finance.insights(householdId, today);
    }
  }

  private async explainChange(
    householdId: string,
    frame: QueryFrame,
    today: IsoDate,
    directory: HouseholdDirectory,
    filters: Filters,
  ): Promise<unknown> {
    const period = comparisonPeriod(frame, filters, today);
    const [trends, anomalies] = await Promise.all([
      this.finance.spendingTrends(householdId, period),
      contains(period, today) ? this.finance.anomalies(householdId, today) : Promise.resolve([]),
    ]);
    const { categoryId, memberId } = filters;
    const withinSubject = new Set(
      directory.categories
        .filter((category) => category.parentId === (categoryId ?? null))
        .map((category) => category.id),
    );
    const subject =
      categoryId === undefined
        ? trends.total
        : (trends.byCategory.find((trend) => trend.categoryId === categoryId) ?? null);
    return {
      currency: trends.currency,
      currentPeriod: trends.currentPeriod,
      previousPeriod: trends.previousPeriod,
      ...(categoryId === undefined ? {} : { categoryId }),
      change: subject,
      breakdown: trends.byCategory.filter(
        (trend) => trend.categoryId !== null && withinSubject.has(trend.categoryId),
      ),
      byMember:
        categoryId === undefined
          ? trends.byMember.filter((trend) => memberId === undefined || trend.memberId === memberId)
          : [],
      unusual: anomalies.filter(
        (anomaly) =>
          categoryId === undefined ||
          anomaly.categoryId === categoryId ||
          withinSubject.has(anomaly.categoryId),
      ),
    };
  }
}

function resolve(
  context: RequestContext,
  frame: QuestionFrame,
  directory: HouseholdDirectory,
  today: IsoDate,
): Resolution {
  const problems: QueryProblem[] = [];
  const period = resolvePeriodReference(frame.period, today);
  if (period === undefined) {
    problems.push('UNRESOLVABLE_PERIOD');
  }
  const category = findByName(directory.categories, frame.category);
  if (frame.category !== null && category === undefined) {
    problems.push('UNKNOWN_CATEGORY');
  }
  const member = resolveMember(context, frame, directory.members);
  if (frame.memberScope === 'NAMED_MEMBER' && member === undefined) {
    problems.push('UNKNOWN_MEMBER');
  }
  const account =
    frame.account === null
      ? undefined
      : resolveMentionedAccount(frame.account, directory.accounts, context.memberId);
  if (account !== undefined && account.status !== 'RESOLVED') {
    problems.push(account.status === 'UNKNOWN' ? 'UNKNOWN_ACCOUNT' : 'AMBIGUOUS_ACCOUNT');
  }
  return {
    problems,
    period,
    category,
    member,
    account: account?.status === 'RESOLVED' ? account.account : undefined,
  };
}

function resolveMember(
  context: RequestContext,
  frame: QuestionFrame,
  members: readonly NamedEntry[],
): NamedEntry | undefined {
  if (frame.memberScope === 'SENDER') {
    return members.find((member) => member.id === context.memberId);
  }
  return frame.memberScope === 'NAMED_MEMBER' ? findByName(members, frame.memberName) : undefined;
}

function canonicalFrame(frame: QuestionFrame, resolution: Resolution): QuestionFrame {
  const namesMember = frame.memberScope === 'NAMED_MEMBER' && resolution.member !== undefined;
  return {
    intent: frame.intent,
    period:
      resolution.period === undefined ? { ...frame.period, kind: 'UNSPECIFIED' } : frame.period,
    category: resolution.category?.name ?? null,
    account: resolution.account?.name ?? null,
    memberScope:
      frame.memberScope === 'NAMED_MEMBER' && !namesMember ? 'HOUSEHOLD' : frame.memberScope,
    memberName: namesMember ? resolution.member.name : null,
  };
}

function comparisonPeriod(frame: QuestionFrame, filters: Filters, today: IsoDate): DateRange {
  if (frame.period.kind === 'UNSPECIFIED') {
    return monthToDate(today);
  }
  const { period } = filters;
  return period.start <= today && today < period.end ? { start: period.start, end: today } : period;
}

function focusFlow(flow: PeriodFlow, intent: QueryIntent, filters: Filters): unknown {
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

function findByName<Item extends NamedEntry>(
  items: readonly Item[],
  name: string | null,
): Item | undefined {
  if (name === null) {
    return undefined;
  }
  return items.find((item) => normalizeName(item.name) === normalizeName(name));
}

function namesOf(directory: HouseholdDirectory): NameDirectory {
  const byId = (items: readonly NamedEntry[]): Map<string, string> =>
    new Map(items.map((item) => [item.id, item.name]));
  return {
    members: byId(directory.members),
    categories: byId(directory.categories),
    accounts: byId(directory.accounts),
    goals: byId(directory.goals),
  };
}
