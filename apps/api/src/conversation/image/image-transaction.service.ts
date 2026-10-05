import { Injectable } from '@nestjs/common';
import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { ImageReading } from '../../ai/vision/image-extraction.schema.js';
import { ImageTransactionReader } from '../../ai/vision/image-transaction-reader.js';
import { HouseholdDirectoryService } from '../../directory/household-directory.service.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import type { RequestContext } from '../../households/request-context.js';
import { MediaError, type MediaProblem, type MediaReference } from '../../media/media-source.js';
import { TemporaryMediaStore } from '../../media/temporary-media-store.js';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.js';
import { formatMoney } from '../../money/format-money.js';
import { TransactionsService, type Transaction } from '../../transactions/transactions.service.js';
import { toCategoryOptions } from '../category-options.js';
import {
  TransactionExtractionService,
  type ExtractionOutcome,
} from '../extraction/transaction-extraction.service.js';

export interface ImageMessage {
  readonly media: MediaReference;
  readonly caption?: string;
  readonly sourceMessageId?: string;
}

export type ImageRejection = MediaProblem | 'NOT_FINANCIAL' | 'UNREADABLE';

export type ImageOutcome =
  | Extract<ExtractionOutcome, { status: 'RECORDED' }>
  | {
      readonly status: 'ALREADY_RECORDED';
      readonly transaction: Transaction;
      readonly facts: ReplyFacts;
    }
  | Extract<ExtractionOutcome, { status: 'NEEDS_CLARIFICATION' }>
  | {
      readonly status: 'NEEDS_CLARIFICATION';
      readonly reasons: readonly ['MULTIPLE_TRANSACTIONS'];
      readonly candidate: null;
      readonly facts: ReplyFacts;
    }
  | {
      readonly status: 'IMAGE_NOT_USABLE';
      readonly reason: ImageRejection;
      readonly facts: ReplyFacts;
    };

type MediaReading = ImageReading | { readonly kind: 'REJECTED'; readonly problem: MediaProblem };

@Injectable()
export class ImageTransactionService {
  constructor(
    private readonly media: TemporaryMediaStore,
    private readonly reader: ImageTransactionReader,
    private readonly extraction: TransactionExtractionService,
    private readonly transactions: TransactionsService,
    private readonly directory: HouseholdDirectoryService,
  ) {}

  async extract(
    context: RequestContext,
    message: ImageMessage,
    today: IsoDate,
  ): Promise<ImageOutcome> {
    const existing = await this.findRecorded(context, message);
    if (existing !== undefined) {
      return alreadyRecorded(existing, context.locale ?? DEFAULT_LOCALE);
    }
    const reading = await this.read(context, message);
    switch (reading.kind) {
      case 'REJECTED':
        return notUsable(reading.problem);
      case 'NOT_FINANCIAL':
      case 'UNREADABLE':
        return notUsable(reading.kind);
      case 'MULTIPLE_TRANSACTIONS':
        return {
          status: 'NEEDS_CLARIFICATION',
          reasons: ['MULTIPLE_TRANSACTIONS'],
          candidate: null,
          facts: {
            reasons: ['MULTIPLE_TRANSACTIONS'],
            transactionsSeen: reading.transactionCount,
          },
        };
      case 'SINGLE_TRANSACTION':
        return this.extraction.extract({
          context,
          candidate: reading.transaction,
          today,
          medium: 'IMAGE',
          ...(message.sourceMessageId === undefined
            ? {}
            : { sourceMessageId: message.sourceMessageId }),
        });
    }
  }

  private async findRecorded(
    context: RequestContext,
    message: ImageMessage,
  ): Promise<Transaction | undefined> {
    return message.sourceMessageId === undefined
      ? undefined
      : this.transactions.findBySourceMessage(context.householdId, message.sourceMessageId);
  }

  private async read(context: RequestContext, message: ImageMessage): Promise<MediaReading> {
    const { accounts, categories } = await this.directory.load(context.householdId);
    try {
      return await this.media.withImage(message.media, ({ mimeType, bytes }) =>
        this.reader.read({
          image: { mimeType, bytes },
          caption: message.caption ?? null,
          accountNames: accounts.map((account) => account.name),
          categories: toCategoryOptions(categories),
        }),
      );
    } catch (error) {
      if (error instanceof MediaError) {
        return { kind: 'REJECTED', problem: error.problem };
      }
      throw error;
    }
  }
}

function notUsable(reason: ImageRejection): ImageOutcome {
  return { status: 'IMAGE_NOT_USABLE', reason, facts: { reason } };
}

function alreadyRecorded(transaction: Transaction, locale: Locale): ImageOutcome {
  return {
    status: 'ALREADY_RECORDED',
    transaction,
    facts: {
      alreadyRecorded: true,
      type: transaction.type,
      amount: formatMoney(transaction.amountMinor, transaction.currency, locale),
      merchant: transaction.merchant,
      date: transaction.transactionDate,
    },
  };
}
