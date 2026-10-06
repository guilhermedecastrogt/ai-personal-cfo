import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import { InvalidMoneyError, isSupportedCurrency, parseMoney } from '../../money/money.js';
import type { NewTransactionInput } from '../../transactions/new-transaction.schema.js';
import {
  normalizeName,
  resolveMentionedAccount,
  resolveUnmentionedAccount,
  type AccountOption,
  type AccountResolution,
} from './account-resolution.js';
import { resolveDateReference } from './date-reference.js';

export type DraftProblem =
  | 'MISSING_TYPE'
  | 'MISSING_AMOUNT'
  | 'INVALID_AMOUNT'
  | 'UNSUPPORTED_CURRENCY'
  | 'CURRENCY_MISMATCH'
  | 'MISSING_CATEGORY'
  | 'UNKNOWN_CATEGORY'
  | 'CATEGORY_KIND_MISMATCH'
  | 'UNKNOWN_ACCOUNT'
  | 'AMBIGUOUS_ACCOUNT'
  | 'MISSING_TRANSFER_ACCOUNT'
  | 'UNKNOWN_TRANSFER_ACCOUNT'
  | 'AMBIGUOUS_TRANSFER_ACCOUNT'
  | 'UNRESOLVABLE_DATE'
  | 'FUTURE_DATE'
  | 'LOW_CONFIDENCE';

export interface CategoryOption {
  readonly id: string;
  readonly name: string;
  readonly kind: 'EXPENSE' | 'INCOME';
}

export interface DraftingContext {
  readonly senderId: string;
  readonly today: IsoDate;
  readonly accounts: readonly AccountOption[];
  readonly defaultAccount: AccountOption | undefined;
  readonly categories: readonly CategoryOption[];
  readonly confidenceThreshold: number;
}

export type DraftFields = Omit<NewTransactionInput, 'memberId' | 'source' | 'sourceMessageId'>;

export interface Understood {
  readonly type: TransactionCandidate['type'];
  readonly amountMinor: number | undefined;
  readonly currency: string | undefined;
  readonly merchant: string | undefined;
  readonly category: CategoryOption | undefined;
  readonly account: AccountOption | undefined;
  readonly transferAccount: AccountOption | undefined;
  readonly date: IsoDate | undefined;
}

export interface TransactionDraft {
  readonly problems: readonly DraftProblem[];
  readonly understood: Understood;
  readonly fields: DraftFields | undefined;
}

export function draftTransaction(
  candidate: TransactionCandidate,
  context: DraftingContext,
): TransactionDraft {
  const problems: DraftProblem[] = [];
  const report = (problem: DraftProblem | undefined): void => {
    if (problem !== undefined) {
      problems.push(problem);
    }
  };
  if (candidate.type === null) {
    report('MISSING_TYPE');
  }
  const statedCurrency = textOrUndefined(candidate.currency)?.toUpperCase();
  const hasValidStatedCurrency =
    statedCurrency !== undefined && isSupportedCurrency(statedCurrency);
  if (statedCurrency !== undefined && !hasValidStatedCurrency) {
    report('UNSUPPORTED_CURRENCY');
  }
  const accountResolution =
    candidate.account === null
      ? resolveUnmentionedAccount(
          context.accounts,
          context.defaultAccount,
          hasValidStatedCurrency
            ? { currency: statedCurrency, senderId: context.senderId }
            : undefined,
        )
      : resolveMentionedAccount(candidate.account, context.accounts, context.senderId);
  report(accountProblem(accountResolution, 'UNKNOWN_ACCOUNT', 'AMBIGUOUS_ACCOUNT'));
  const account = resolved(accountResolution);
  const currency = hasValidStatedCurrency ? statedCurrency : account?.currency;
  if (hasValidStatedCurrency && account !== undefined && account.currency !== statedCurrency) {
    report('CURRENCY_MISMATCH');
  }
  const amount = readAmount(candidate.amount, currency);
  report(amount.problem);
  const category = readCategory(candidate, context.categories);
  report(category.problem);
  const transfer = readTransferAccount(candidate, context);
  report(transfer.problem);
  const date = resolveDateReference(candidate.date, context.today);
  if (date === undefined) {
    report('UNRESOLVABLE_DATE');
  } else if (date > context.today) {
    report('FUTURE_DATE');
  }
  if (candidate.confidence < context.confidenceThreshold) {
    report('LOW_CONFIDENCE');
  }
  const understood: Understood = {
    type: candidate.type,
    amountMinor: amount.amountMinor,
    currency,
    merchant: presentMerchant(textOrUndefined(candidate.merchant)),
    category: category.category,
    account,
    transferAccount: transfer.account,
    date,
  };
  return {
    problems,
    understood,
    fields: problems.length === 0 ? toFields(candidate, understood) : undefined,
  };
}

function toFields(
  candidate: TransactionCandidate,
  understood: Understood,
): DraftFields | undefined {
  const { type, amountMinor, currency, account, date } = understood;
  if (
    type === null ||
    amountMinor === undefined ||
    currency === undefined ||
    account === undefined ||
    date === undefined
  ) {
    return undefined;
  }
  const description = textOrUndefined(candidate.description);
  return {
    type,
    amountMinor,
    currency,
    accountId: account.id,
    transactionDate: date,
    aiConfidence: candidate.confidence,
    ...(understood.transferAccount === undefined
      ? {}
      : { transferAccountId: understood.transferAccount.id }),
    ...(understood.category === undefined ? {} : { categoryId: understood.category.id }),
    ...(understood.merchant === undefined ? {} : { merchant: understood.merchant }),
    ...(description === undefined ? {} : { description }),
    ...(candidate.paymentMethod === null ? {} : { paymentMethod: candidate.paymentMethod }),
  };
}

function readAmount(
  amount: string | null,
  currency: string | undefined,
): { amountMinor?: number; problem?: DraftProblem } {
  const text = textOrUndefined(amount);
  if (text === undefined) {
    return { problem: 'MISSING_AMOUNT' };
  }
  if (currency === undefined) {
    return {};
  }
  try {
    const { amountMinor } = parseMoney(text, currency);
    return amountMinor > 0 ? { amountMinor } : { problem: 'INVALID_AMOUNT' };
  } catch (error) {
    if (error instanceof InvalidMoneyError) {
      return { problem: 'INVALID_AMOUNT' };
    }
    throw error;
  }
}

function readCategory(
  candidate: TransactionCandidate,
  categories: readonly CategoryOption[],
): { category?: CategoryOption; problem?: DraftProblem } {
  if (candidate.type === 'TRANSFER') {
    return {};
  }
  const name = textOrUndefined(candidate.category);
  if (name === undefined) {
    return candidate.type === 'EXPENSE' ? { problem: 'MISSING_CATEGORY' } : {};
  }
  const category = categories.find((option) => normalizeName(option.name) === normalizeName(name));
  if (category === undefined) {
    return { problem: 'UNKNOWN_CATEGORY' };
  }
  return candidate.type !== null && category.kind !== candidate.type
    ? { problem: 'CATEGORY_KIND_MISMATCH' }
    : { category };
}

function readTransferAccount(
  candidate: TransactionCandidate,
  context: DraftingContext,
): { account?: AccountOption; problem?: DraftProblem } {
  if (candidate.type !== 'TRANSFER') {
    return {};
  }
  if (candidate.transferAccount === null) {
    return { problem: 'MISSING_TRANSFER_ACCOUNT' };
  }
  const resolution = resolveMentionedAccount(
    candidate.transferAccount,
    context.accounts,
    context.senderId,
  );
  const problem = accountProblem(
    resolution,
    'UNKNOWN_TRANSFER_ACCOUNT',
    'AMBIGUOUS_TRANSFER_ACCOUNT',
  );
  const account = resolved(resolution);
  return {
    ...(account === undefined ? {} : { account }),
    ...(problem === undefined ? {} : { problem }),
  };
}

function accountProblem(
  resolution: AccountResolution<AccountOption>,
  unknown: DraftProblem,
  ambiguous: DraftProblem,
): DraftProblem | undefined {
  if (resolution.status === 'RESOLVED') {
    return undefined;
  }
  return resolution.status === 'UNKNOWN' ? unknown : ambiguous;
}

function resolved(resolution: AccountResolution<AccountOption>): AccountOption | undefined {
  return resolution.status === 'RESOLVED' ? resolution.account : undefined;
}

function textOrUndefined(value: string | null): string | undefined {
  const text = value?.trim() ?? '';
  return text === '' ? undefined : text;
}

const LOWER_CASE_JOINERS: ReadonlySet<string> = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'of',
  'the',
  'and',
]);

export function presentMerchant(merchant: string | undefined): string | undefined {
  if (merchant?.toLowerCase() !== merchant) {
    return merchant;
  }
  if (merchant === undefined) {
    return undefined;
  }
  return merchant
    .split(' ')
    .map((word, position) =>
      position > 0 && LOWER_CASE_JOINERS.has(word)
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(' ');
}
