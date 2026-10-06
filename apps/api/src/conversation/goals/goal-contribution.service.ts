import { Injectable } from '@nestjs/common';
import type { GoalContributionRequest } from '../../ai/interpretation/message-interpretation.schema.js';
import { HouseholdDirectoryService } from '../../directory/household-directory.service.js';
import { FinanceService } from '../../finance/application/finance.service.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import { GoalsService, type Goal } from '../../goals/goals.service.js';
import type { RequestContext } from '../../households/request-context.js';
import { DEFAULT_LOCALE } from '../../i18n/locale.js';
import { formatBasisPoints, formatMoney } from '../../money/format-money.js';
import { parseMoneyInput } from '../../money/parse-money-input.js';
import type { Transaction } from '../../transactions/transactions.service.js';
import { CorrectionService } from '../corrections/correction.service.js';
import { resolveDateReference } from '../extraction/date-reference.js';
import { resolveMentionedMember } from '../extraction/member-resolution.js';
import { resolveMentionedGoal } from './goal-resolution.js';

export interface GoalProgressText {
  readonly saved: string;
  readonly target: string;
  readonly share: string;
  readonly completed: boolean;
}

export type ContributionResult =
  | {
      readonly status: 'CONTRIBUTED';
      readonly goal: string;
      readonly added: string;
      readonly progress: GoalProgressText | null;
    }
  | { readonly status: 'GOAL_UNKNOWN'; readonly options: readonly string[] }
  | { readonly status: 'GOAL_AMBIGUOUS'; readonly options: readonly string[] }
  | { readonly status: 'TARGET_NOT_FOUND' }
  | { readonly status: 'TARGET_AMBIGUOUS'; readonly transactions: readonly Transaction[] }
  | {
      readonly status: 'CURRENCY_MISMATCH';
      readonly goal: string;
      readonly goalCurrency: string;
      readonly currency: string;
    }
  | { readonly status: 'ALREADY_CONTRIBUTED'; readonly goal: string }
  | { readonly status: 'INVALID_AMOUNT' }
  | { readonly status: 'UNKNOWN_MEMBER' };

interface Contribution {
  readonly amountMinor: number;
  readonly currency: string;
  readonly contributionDate: string;
  readonly memberId: string;
  readonly transactionId: string | null;
}

type ContributionSource =
  | { readonly status: 'READY'; readonly contribution: Contribution }
  | Exclude<
      ContributionResult,
      { status: 'CONTRIBUTED' | 'GOAL_UNKNOWN' | 'GOAL_AMBIGUOUS' | 'CURRENCY_MISMATCH' }
    >;

@Injectable()
export class GoalContributionService {
  constructor(
    private readonly goals: GoalsService,
    private readonly corrections: CorrectionService,
    private readonly directories: HouseholdDirectoryService,
    private readonly finance: FinanceService,
  ) {}

  async contribute(
    context: RequestContext,
    conversationId: string,
    request: GoalContributionRequest,
    today: IsoDate,
  ): Promise<ContributionResult> {
    const active = (await this.goals.list(context.householdId)).filter(
      (goal) => goal.status !== 'CANCELLED',
    );
    const resolution = resolveMentionedGoal(request.goal, active);
    if (resolution.status === 'UNKNOWN') {
      return { status: 'GOAL_UNKNOWN', options: active.map((goal) => goal.name) };
    }
    if (resolution.status === 'AMBIGUOUS') {
      return { status: 'GOAL_AMBIGUOUS', options: resolution.goals.map((goal) => goal.name) };
    }
    const { goal } = resolution;
    const source = await this.source(context, conversationId, request, goal, today);
    if (source.status !== 'READY') {
      return source;
    }
    const outcome = await this.goals.contribute(context.householdId, {
      goalId: goal.id,
      ...source.contribution,
    });
    switch (outcome.status) {
      case 'CONTRIBUTED':
        return {
          status: 'CONTRIBUTED',
          goal: goal.name,
          added: this.money(context, source.contribution.amountMinor, goal.currency),
          progress: await this.progress(context, goal.id, today),
        };
      case 'CURRENCY_MISMATCH':
        return {
          status: 'CURRENCY_MISMATCH',
          goal: goal.name,
          goalCurrency: goal.currency,
          currency: source.contribution.currency,
        };
      case 'ALREADY_CONTRIBUTED':
        return { status: 'ALREADY_CONTRIBUTED', goal: goal.name };
      case 'NOT_FOUND':
      case 'CANCELLED':
        return { status: 'GOAL_UNKNOWN', options: active.map((entry) => entry.name) };
    }
  }

  private async source(
    context: RequestContext,
    conversationId: string,
    request: GoalContributionRequest,
    goal: Goal,
    today: IsoDate,
  ): Promise<ContributionSource> {
    if (request.fromRecorded) {
      const found = await this.corrections.findRecorded(
        context,
        conversationId,
        request.target,
        today,
      );
      if (found.status === 'NOT_FOUND') {
        return { status: 'TARGET_NOT_FOUND' };
      }
      if (found.status === 'AMBIGUOUS') {
        return { status: 'TARGET_AMBIGUOUS', transactions: found.transactions };
      }
      const { transaction } = found;
      return {
        status: 'READY',
        contribution: {
          amountMinor: transaction.amountMinor,
          currency: transaction.currency,
          contributionDate: transaction.transactionDate,
          memberId: transaction.memberId,
          transactionId: transaction.id,
        },
      };
    }
    const stated = request.currency?.trim().toUpperCase() ?? '';
    const currency = stated === '' ? goal.currency : stated;
    const amountMinor =
      request.amount === null ? undefined : parseMoneyInput(request.amount, currency);
    if (amountMinor === undefined) {
      return { status: 'INVALID_AMOUNT' };
    }
    const memberId = await this.memberOf(context, request.member);
    if (memberId === undefined) {
      return { status: 'UNKNOWN_MEMBER' };
    }
    return {
      status: 'READY',
      contribution: {
        amountMinor,
        currency,
        contributionDate: resolveDateReference(request.date, today) ?? today,
        memberId,
        transactionId: null,
      },
    };
  }

  private async memberOf(
    context: RequestContext,
    member: string | null,
  ): Promise<string | undefined> {
    const mention = member?.trim() ?? '';
    if (mention === '') {
      return context.memberId;
    }
    const { members } = await this.directories.load(context.householdId);
    const resolution = resolveMentionedMember(mention, members);
    return resolution.status === 'RESOLVED' ? resolution.member.id : undefined;
  }

  private async progress(
    context: RequestContext,
    goalId: string,
    today: IsoDate,
  ): Promise<GoalProgressText | null> {
    const progress = (await this.finance.goals(context.householdId, today)).find(
      (entry) => entry.goalId === goalId,
    );
    if (progress === undefined) {
      return null;
    }
    return {
      saved: this.money(context, progress.currentMinor, progress.currency),
      target: this.money(context, progress.targetMinor, progress.currency),
      share: formatBasisPoints(progress.progressBasisPoints, context.locale ?? DEFAULT_LOCALE),
      completed: progress.state === 'COMPLETED',
    };
  }

  private money(context: RequestContext, amountMinor: number, currency: string): string {
    return formatMoney(amountMinor, currency, context.locale ?? DEFAULT_LOCALE);
  }
}
