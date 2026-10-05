import { Injectable } from '@nestjs/common';
import { AccountsRepository } from '../accounts/accounts.repository.js';
import type { ReviewNarrative } from '../ai/review/review-narrative.schema.js';
import { CategoriesRepository } from '../categories/categories.repository.js';
import { HouseholdNotFoundError } from '../finance/application/finance.service.js';
import { DEFAULT_FINANCE_POLICY } from '../finance/domain/finance-policy.js';
import type { DateRange, IsoDate } from '../finance/domain/period/period.js';
import { GoalsRepository } from '../goals/goals.repository.js';
import { HouseholdsRepository } from '../households/households.repository.js';
import type { RequestContext } from '../households/request-context.js';
import type { ReplyFacts } from '../ai/ai-provider.js';
import { FinancialSnapshotBuilder } from './analysis/financial-snapshot.builder.js';
import type { FinancialSnapshot } from './analysis/financial-snapshot.js';
import { buildMonthlyReview, type MonthlyReview } from './analysis/monthly-review.js';
import type { NameDirectory } from './context/result-description.js';
import { toReviewContext } from './context/review-context.js';
import { ReviewExplainer, type NarrativeSource } from './explanation/review-explainer.js';

export interface MonthlyReviewRequest {
  readonly month: DateRange;
  readonly today: IsoDate;
  readonly userMessage?: string;
}

export interface CurrencyAnalysis {
  readonly snapshot: FinancialSnapshot;
  readonly review: MonthlyReview;
  readonly context: ReplyFacts;
}

export interface MonthlyAnalysis {
  readonly month: DateRange;
  readonly analyses: readonly CurrencyAnalysis[];
  readonly directory: NameDirectory;
}

export interface MonthlyReviewResult {
  readonly month: DateRange;
  readonly reviews: readonly MonthlyReview[];
  readonly narrative: ReviewNarrative;
  readonly narrativeSource: NarrativeSource;
}

export class FutureMonthError extends Error {
  constructor() {
    super('A review cannot be produced for a month that has not started');
    this.name = FutureMonthError.name;
  }
}

interface Named {
  readonly id: string;
  readonly name: string;
}

@Injectable()
export class CfoService {
  private readonly policy = DEFAULT_FINANCE_POLICY;

  constructor(
    private readonly snapshots: FinancialSnapshotBuilder,
    private readonly explainer: ReviewExplainer,
    private readonly households: HouseholdsRepository,
    private readonly accounts: AccountsRepository,
    private readonly categories: CategoriesRepository,
    private readonly goals: GoalsRepository,
  ) {}

  async monthlyReview(
    context: RequestContext,
    request: MonthlyReviewRequest,
  ): Promise<MonthlyReviewResult> {
    const analysis = await this.monthlyAnalysis(context, request);
    const explained = await this.explainer.explain({
      userMessage: request.userMessage ?? null,
      senderName: context.memberName,
      reviews: analysis.analyses.map((currency) => currency.context),
    });
    return {
      month: request.month,
      reviews: analysis.analyses.map((currency) => currency.review),
      narrative: explained.narrative,
      narrativeSource: explained.source,
    };
  }

  async monthlyAnalysis(
    context: Pick<RequestContext, 'householdId'>,
    request: Pick<MonthlyReviewRequest, 'month' | 'today'>,
  ): Promise<MonthlyAnalysis> {
    const { householdId } = context;
    if (request.month.start > request.today) {
      throw new FutureMonthError();
    }
    const [household, members, accounts, categories, goals] = await Promise.all([
      this.households.findHousehold(householdId),
      this.households.listMembers(householdId),
      this.accounts.list(householdId),
      this.categories.list(),
      this.goals.list(householdId),
    ]);
    if (household === undefined) {
      throw new HouseholdNotFoundError();
    }
    const topLevelCategoryIds = categories
      .filter((category) => category.parentId === null)
      .map((category) => category.id);
    const currencies = [
      ...new Set([household.currency, ...accounts.map((account) => account.currency).sort()]),
    ];
    const directory: NameDirectory = {
      members: namesById(members),
      categories: namesById(categories),
      accounts: namesById(accounts),
      goals: namesById(goals),
    };
    const candidates = await Promise.all(
      currencies.map(async (currency) => {
        const snapshot = await this.snapshots.build({
          householdId,
          currency,
          month: request.month,
          today: request.today,
          topLevelCategoryIds,
        });
        const review = buildMonthlyReview(snapshot, this.policy);
        return { snapshot, review, context: toReviewContext(review, directory) };
      }),
    );
    return {
      month: request.month,
      directory,
      analyses: candidates.filter(
        ({ review }) => review.currency === household.currency || hasContent(review),
      ),
    };
  }
}

function hasContent(review: MonthlyReview): boolean {
  return review.transactionCount > 0 || review.budgets.length > 0 || review.goals.length > 0;
}

function namesById(items: readonly Named[]): Map<string, string> {
  return new Map(items.map((item) => [item.id, item.name]));
}
