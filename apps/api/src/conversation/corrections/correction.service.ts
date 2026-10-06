import { Injectable } from '@nestjs/common';
import type {
  Correction,
  CorrectionTarget,
} from '../../ai/interpretation/message-interpretation.schema.js';
import {
  HouseholdDirectoryService,
  type HouseholdDirectory,
} from '../../directory/household-directory.service.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import type { RequestContext } from '../../households/request-context.js';
import {
  TransactionRejectedError,
  TransactionsService,
  type Transaction,
} from '../../transactions/transactions.service.js';
import type { PendingDeletion } from '../conversation-state.js';
import { ConversationsRepository } from '../conversations.repository.js';
import type { ClarificationReason } from '../extraction/transaction-extraction.service.js';
import { applyCorrection } from './correction-edit.js';
import { resolveCorrectionTarget, type TargetResolution } from './correction-target.js';

export type CorrectionOutcome =
  | { readonly status: 'CORRECTED'; readonly transaction: Transaction }
  | {
      readonly status: 'CONFIRM_DELETION';
      readonly transaction: Transaction;
      readonly pending: PendingDeletion;
    }
  | { readonly status: 'DELETED'; readonly transaction: Transaction }
  | { readonly status: 'AMBIGUOUS'; readonly transactions: readonly Transaction[] }
  | { readonly status: 'REJECTED'; readonly reasons: readonly ClarificationReason[] }
  | { readonly status: 'UNCHANGED'; readonly transaction: Transaction }
  | { readonly status: 'STALE' }
  | { readonly status: 'NOT_FOUND' };

@Injectable()
export class CorrectionService {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly conversations: ConversationsRepository,
    private readonly directories: HouseholdDirectoryService,
  ) {}

  async correct(
    context: RequestContext,
    conversationId: string,
    correction: Correction,
    today: IsoDate,
  ): Promise<CorrectionOutcome> {
    const directory = await this.directories.load(context.householdId);
    const resolution = await this.resolve(
      context,
      conversationId,
      correction.target,
      directory,
      today,
    );
    if (resolution.status !== 'RESOLVED') {
      return resolution;
    }
    const { transaction } = resolution;
    if (correction.action === 'DELETE') {
      return {
        status: 'CONFIRM_DELETION',
        transaction,
        pending: { target: correction.target, version: transaction.updatedAt.toISOString() },
      };
    }
    return this.edit(context, transaction, correction, directory, today, true);
  }

  async confirmDeletion(
    context: RequestContext,
    conversationId: string,
    pending: PendingDeletion,
    today: IsoDate,
  ): Promise<CorrectionOutcome> {
    const directory = await this.directories.load(context.householdId);
    const resolution = await this.resolve(
      context,
      conversationId,
      pending.target,
      directory,
      today,
    );
    if (resolution.status !== 'RESOLVED') {
      return { status: 'NOT_FOUND' };
    }
    const { transaction } = resolution;
    if (transaction.updatedAt.toISOString() !== pending.version) {
      return { status: 'STALE' };
    }
    return (await this.transactions.remove(context.householdId, transaction.id))
      ? { status: 'DELETED', transaction }
      : { status: 'NOT_FOUND' };
  }

  async findRecorded(
    context: RequestContext,
    conversationId: string,
    target: CorrectionTarget,
    today: IsoDate,
  ): Promise<TargetResolution> {
    const directory = await this.directories.load(context.householdId);
    return this.resolve(context, conversationId, target, directory, today);
  }

  private async resolve(
    context: RequestContext,
    conversationId: string,
    target: CorrectionTarget,
    directory: HouseholdDirectory,
    today: IsoDate,
  ): Promise<TargetResolution> {
    const sourceMessageIds = await this.conversations.recentSourceMessageIds(
      context.householdId,
      conversationId,
    );
    const recent = await this.transactions.findBySourceMessages(
      context.householdId,
      sourceMessageIds,
    );
    return resolveCorrectionTarget(recent, target, {
      members: directory.members,
      categoryNames: new Map(directory.categories.map((category) => [category.id, category.name])),
      today,
    });
  }

  private async edit(
    context: RequestContext,
    transaction: Transaction,
    correction: Correction,
    directory: HouseholdDirectory,
    today: IsoDate,
    mayRetry: boolean,
  ): Promise<CorrectionOutcome> {
    const application = applyCorrection(transaction, correction.changes, {
      accounts: directory.accounts,
      categories: directory.categories,
      members: directory.members,
      today,
    });
    if (application.status === 'UNCHANGED') {
      return { status: 'UNCHANGED', transaction };
    }
    if (application.status === 'REJECTED') {
      return { status: 'REJECTED', reasons: application.reasons };
    }
    try {
      const outcome = await this.transactions.edit(
        context.householdId,
        transaction.id,
        transaction.updatedAt.toISOString(),
        application.edit,
      );
      if (outcome.status === 'UPDATED') {
        return { status: 'CORRECTED', transaction: outcome.transaction };
      }
      if (outcome.status === 'NOT_FOUND') {
        return { status: 'NOT_FOUND' };
      }
      const current = await this.transactions.find(context.householdId, transaction.id);
      if (!mayRetry || current === undefined) {
        return { status: 'STALE' };
      }
      return await this.edit(context, current, correction, directory, today, false);
    } catch (error) {
      if (error instanceof TransactionRejectedError) {
        return { status: 'REJECTED', reasons: error.reasons };
      }
      throw error;
    }
  }
}
