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
    const [{ accounts, categories }, defaultAccount] = await Promise.all([
      this.directory.load(context.householdId),
      this.directory.defaultAccount(context.householdId, context.memberId),
    ]);
    const draft = draftTransaction(candidate, {
      senderId: context.memberId,
      today,
      accounts,
      defaultAccount,
      categories,
      confidenceThreshold: this.config.aiConfidenceThreshold,
    });
    if (draft.fields === undefined) {
      return clarification(
        draft.problems,
        candidate,
        draft.understood,
        accounts,
        categories,
        locale,
      );
    }
    try {
      const transaction = await this.transactions.record(context.householdId, {
        ...draft.fields,
        memberId: context.memberId,
        source: sourceOf(context, request.medium),
        ...(request.sourceMessageId === undefined
          ? {}
          : { sourceMessageId: request.sourceMessageId }),
      });
      return { status: 'RECORDED', transaction, facts: describe(draft.understood, locale) };
    } catch (error) {
      if (error instanceof TransactionRejectedError) {
        return clarification(
          error.reasons,
          candidate,
          draft.understood,
          accounts,
          categories,
          locale,
        );
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

function clarification(
  reasons: readonly ClarificationReason[],
  candidate: TransactionCandidate,
  understood: Understood,
  accounts: readonly AccountOption[],
  categories: readonly CategoryOption[],
  locale: Locale,
): ExtractionOutcome {
  const needsCategory = reasons.some((reason) => CATEGORY_REASONS.includes(reason));
  const needsAccount = reasons.some((reason) => ACCOUNT_REASONS.includes(reason));
  const wantedKind = understood.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  return {
    status: 'NEEDS_CLARIFICATION',
    reasons,
    candidate,
    facts: {
      reasons,
      understood: describe(understood, locale),
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
    },
  };
}

function describe(understood: Understood, locale: Locale): ReplyFacts {
  const { amountMinor, currency } = understood;
  return {
    type: understood.type,
    amount:
      amountMinor === undefined || currency === undefined
        ? null
        : formatMoney(amountMinor, currency, locale),
    merchant: understood.merchant ?? null,
    category: understood.category?.name ?? null,
    account: understood.account?.name ?? null,
    transferTo: understood.transferAccount?.name ?? null,
    date: understood.date ?? null,
  };
}
