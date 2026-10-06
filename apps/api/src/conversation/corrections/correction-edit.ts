import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import { parseMoneyInput } from '../../money/parse-money-input.js';
import type { Transaction, TransactionEdit } from '../../transactions/transactions.service.js';
import {
  normalizeName,
  resolveMentionedAccount,
  type AccountOption,
} from '../extraction/account-resolution.js';
import { resolveDateReference } from '../extraction/date-reference.js';
import { resolveMentionedMember, type MemberOption } from '../extraction/member-resolution.js';
import { presentMerchant, type CategoryOption } from '../extraction/transaction-draft.js';
import type { ClarificationReason } from '../extraction/transaction-extraction.service.js';

export type CorrectionApplication =
  | { readonly status: 'EDIT'; readonly edit: TransactionEdit }
  | { readonly status: 'REJECTED'; readonly reasons: readonly ClarificationReason[] }
  | { readonly status: 'UNCHANGED' };

export interface CorrectionContext {
  readonly accounts: readonly AccountOption[];
  readonly categories: readonly CategoryOption[];
  readonly members: readonly MemberOption[];
  readonly today: IsoDate;
}

export function applyCorrection(
  existing: Transaction,
  changes: TransactionCandidate,
  context: CorrectionContext,
): CorrectionApplication {
  const reasons: ClarificationReason[] = [];
  const type = changes.type ?? existing.type;
  const account = changedAccount(existing, changes, context, reasons);
  const currency = account?.currency ?? existing.currency;
  const statedCurrency = stated(changes.currency)?.toUpperCase();
  if (statedCurrency !== undefined && statedCurrency !== currency) {
    reasons.push('CURRENCY_MISMATCH');
  }
  const amountMinor = changedAmount(existing, changes.amount, currency, reasons);
  const categoryId = changedCategory(existing, changes, type, context.categories, reasons);
  const memberId = changedMember(existing, changes.member, context.members, reasons);
  const transactionDate = changedDate(existing, changes, context.today, reasons);
  if (reasons.length > 0) {
    return { status: 'REJECTED', reasons };
  }
  const merchantText = stated(changes.merchant);
  const descriptionText = stated(changes.description);
  const edit: TransactionEdit = {
    type,
    amountMinor,
    memberId,
    accountId: account?.id ?? existing.accountId,
    categoryId,
    merchant:
      merchantText === undefined ? existing.merchant : (presentMerchant(merchantText) ?? null),
    description: descriptionText ?? existing.description,
    expenseScope: existing.expenseScope,
    transactionDate,
  };
  return isUnchanged(existing, edit) ? { status: 'UNCHANGED' } : { status: 'EDIT', edit };
}

function stated(value: string | null): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

function changedAccount(
  existing: Transaction,
  changes: TransactionCandidate,
  context: CorrectionContext,
  reasons: ClarificationReason[],
): AccountOption | undefined {
  const mention = stated(changes.account);
  if (mention === undefined) {
    return context.accounts.find((account) => account.id === existing.accountId);
  }
  const resolution = resolveMentionedAccount(mention, context.accounts, existing.memberId);
  if (resolution.status === 'RESOLVED') {
    return resolution.account;
  }
  reasons.push(resolution.status === 'AMBIGUOUS' ? 'AMBIGUOUS_ACCOUNT' : 'UNKNOWN_ACCOUNT');
  return undefined;
}

function changedAmount(
  existing: Transaction,
  amount: string | null,
  currency: string,
  reasons: ClarificationReason[],
): number {
  const text = stated(amount);
  if (text === undefined) {
    return existing.amountMinor;
  }
  const amountMinor = parseMoneyInput(text, currency);
  if (amountMinor !== undefined) {
    return amountMinor;
  }
  reasons.push('INVALID_AMOUNT');
  return existing.amountMinor;
}

function changedCategory(
  existing: Transaction,
  changes: TransactionCandidate,
  type: Transaction['type'],
  categories: readonly CategoryOption[],
  reasons: ClarificationReason[],
): string | null {
  if (type === 'TRANSFER') {
    return null;
  }
  const mention = stated(changes.category);
  if (mention === undefined) {
    const current = categories.find((category) => category.id === existing.categoryId);
    return current?.kind === type ? current.id : null;
  }
  const category = categories.find(
    (option) => normalizeName(option.name) === normalizeName(mention),
  );
  if (category === undefined) {
    reasons.push('UNKNOWN_CATEGORY');
    return existing.categoryId;
  }
  if (category.kind !== type) {
    reasons.push('CATEGORY_KIND_MISMATCH');
  }
  return category.id;
}

function changedMember(
  existing: Transaction,
  member: string | null,
  members: readonly MemberOption[],
  reasons: ClarificationReason[],
): string {
  const mention = stated(member);
  if (mention === undefined) {
    return existing.memberId;
  }
  const resolution = resolveMentionedMember(mention, members);
  if (resolution.status === 'RESOLVED') {
    return resolution.member.id;
  }
  reasons.push('UNKNOWN_MEMBER');
  return existing.memberId;
}

function changedDate(
  existing: Transaction,
  changes: TransactionCandidate,
  today: IsoDate,
  reasons: ClarificationReason[],
): string {
  if (changes.date.kind === 'UNSPECIFIED') {
    return existing.transactionDate;
  }
  const date = resolveDateReference(changes.date, today);
  if (date === undefined) {
    reasons.push('UNRESOLVABLE_DATE');
    return existing.transactionDate;
  }
  if (date > today) {
    reasons.push('FUTURE_DATE');
  }
  return date;
}

function isUnchanged(existing: Transaction, edit: TransactionEdit): boolean {
  return (
    edit.type === existing.type &&
    edit.amountMinor === existing.amountMinor &&
    edit.memberId === existing.memberId &&
    edit.accountId === existing.accountId &&
    edit.categoryId === existing.categoryId &&
    edit.merchant === existing.merchant &&
    edit.description === existing.description &&
    edit.transactionDate === existing.transactionDate
  );
}
