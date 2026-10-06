import { Inject, Injectable } from '@nestjs/common';
import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { APP_CONFIG, type AppConfig } from '../../config/app-config.js';
import { HouseholdDirectoryService } from '../../directory/household-directory.service.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import type { RequestContext } from '../../households/request-context.js';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.js';
import { formatMoney } from '../../money/format-money.js';
import type { TransactionSource } from '../../transactions/transaction-vocabulary.js';
import {
  TransactionRejectedError,
  TransactionsService,
  type Transaction,
  type TransactionRejectionReason,
} from '../../transactions/transactions.service.js';
import {
  draftTransaction,
  type CategoryOption,
  type DraftProblem,
  type Understood,
} from './transaction-draft.js';
import type { AccountOption } from './account-resolution.js';
import { describeDate, describeKind, describeNeeds } from './clarification-needs.js';
import { resolveMentionedMember } from './member-resolution.js';

export type ClarificationReason = DraftProblem | TransactionRejectionReason;

export type ExtractionOutcome =
  | {
      readonly status: 'RECORDED';
      readonly transaction: Transaction;
      readonly facts: ReplyFacts;
    }
  | {
      readonly status: 'NEEDS_CLARIFICATION';
      readonly reasons: readonly ClarificationReason[];
      readonly candidate: TransactionCandidate;
      readonly facts: ReplyFacts;
    };

export interface ExtractionRequest {
  readonly context: RequestContext;
  readonly candidate: TransactionCandidate;
  readonly today: IsoDate;
  readonly medium: 'TEXT' | 'IMAGE';
  readonly sourceMessageId?: string;
}

const CATEGORY_REASONS: readonly ClarificationReason[] = [
  'MISSING_CATEGORY',
  'UNKNOWN_CATEGORY',
  'CATEGORY_KIND_MISMATCH',
];

const ACCOUNT_REASONS: readonly ClarificationReason[] = [
  'UNKNOWN_ACCOUNT',
  'AMBIGUOUS_ACCOUNT',
  'MISSING_TRANSFER_ACCOUNT',
  'UNKNOWN_TRANSFER_ACCOUNT',
  'AMBIGUOUS_TRANSFER_ACCOUNT',
  'CURRENCY_MISMATCH',
];

@Injectable()
export class TransactionExtractionService {
  constructor(
    private readonly transactions: TransactionsService,
    private readonly directory: HouseholdDirectoryService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async extract(request: ExtractionRequest): Promise<ExtractionOutcome> {
    const { context, candidate, today } = request;
    const locale = context.locale ?? DEFAULT_LOCALE;
    const { accounts, categories, members } = await this.directory.load(context.householdId);
    const named =
      candidate.member === null || candidate.member.trim() === ''
        ? undefined
        : resolveMentionedMember(candidate.member, members);
    const owner =
      named?.status === 'RESOLVED'
        ? named.member
        : members.find((member) => member.id === context.memberId);
    const ownerId = owner?.id ?? context.memberId;
    const defaultAccount = await this.directory.defaultAccount(context.householdId, ownerId);
    const draft = draftTransaction(candidate, {
      senderId: ownerId,
      today,
      accounts,
      defaultAccount,
      categories,
      confidenceThreshold: this.config.aiConfidenceThreshold,
    });
    const forMember = ownerId === context.memberId ? null : (owner?.name ?? null);
    const clarify = (reasons: readonly ClarificationReason[]): ExtractionOutcome =>
      clarification(reasons, candidate, draft.understood, forMember, {
        accounts,
        categories,
        members,
        locale,
      });
    const unstatedMember =
      named === undefined && candidate.memberReference === 'THIRD_PERSON_UNSTATED';
    if (named?.status === 'UNKNOWN' || unstatedMember) {
      return clarify(['UNKNOWN_MEMBER', ...draft.problems]);
    }
    if (draft.fields === undefined) {
      return clarify(draft.problems);
    }
    try {
      const transaction = await this.transactions.record(context.householdId, {
        ...draft.fields,
        memberId: ownerId,
        source: sourceOf(context, request.medium),
        ...(request.sourceMessageId === undefined
          ? {}
          : { sourceMessageId: request.sourceMessageId }),
      });
      return {
        status: 'RECORDED',
        transaction,
        facts: describe(draft.understood, forMember, locale),
      };
    } catch (error) {
      if (error instanceof TransactionRejectedError) {
        return clarify(error.reasons);
      }
      throw error;
    }
  }
}

function sourceOf(context: RequestContext, medium: ExtractionRequest['medium']): TransactionSource {
  if (context.channel !== 'whatsapp') {
    return 'WEB';
  }
  return medium === 'IMAGE' ? 'WHATSAPP_IMAGE' : 'WHATSAPP_TEXT';
}

interface ClarificationOptions {
  readonly accounts: readonly AccountOption[];
  readonly categories: readonly CategoryOption[];
  readonly members: readonly { readonly name: string }[];
  readonly locale: Locale;
}

function clarification(
  reasons: readonly ClarificationReason[],
  candidate: TransactionCandidate,
  understood: Understood,
  forMember: string | null,
  { accounts, categories, members, locale }: ClarificationOptions,
): ExtractionOutcome {
  const needsCategory = reasons.some((reason) => CATEGORY_REASONS.includes(reason));
  const needsAccount = reasons.some((reason) => ACCOUNT_REASONS.includes(reason));
  const needsMember = reasons.includes('UNKNOWN_MEMBER');
  const wantedKind = understood.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  return {
    status: 'NEEDS_CLARIFICATION',
    reasons,
    candidate,
    facts: {
      needed: describeNeeds(reasons, locale),
      understood: describe(understood, forMember, locale),
      ...(needsCategory
        ? {
            categoryOptions: categories
              .filter((category) => category.kind === wantedKind)
              .map((category) => category.name),
          }
        : {}),
      ...(needsAccount
        ? { accountOptions: accounts.map((account) => `${account.name} (${account.currency})`) }
        : {}),
      ...(needsMember ? { memberOptions: members.map((member) => member.name) } : {}),
    },
  };
}

function describe(understood: Understood, forMember: string | null, locale: Locale): ReplyFacts {
  const { amountMinor, currency } = understood;
  return {
    ...(forMember === null ? {} : { forMember }),
    kind: describeKind(understood.type, locale),
    amount:
      amountMinor === undefined || currency === undefined
        ? null
        : formatMoney(amountMinor, currency, locale),
    merchant: understood.merchant ?? null,
    category: understood.category?.name ?? null,
    account: understood.account?.name ?? null,
    transferTo: understood.transferAccount?.name ?? null,
    date: describeDate(understood.date, locale),
  };
}
