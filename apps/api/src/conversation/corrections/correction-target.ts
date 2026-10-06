import type { CorrectionTarget } from '../../ai/interpretation/message-interpretation.schema.js';
import type { IsoDate } from '../../finance/domain/period/period.js';
import { parseMoneyInput } from '../../money/parse-money-input.js';
import type { Transaction } from '../../transactions/transactions.service.js';
import { resolveDateReference } from '../extraction/date-reference.js';
import {
  comparableName,
  resolveMentionedMember,
  type MemberOption,
} from '../extraction/member-resolution.js';

const MAXIMUM_OPTIONS = 3;

export type TargetResolution =
  | { readonly status: 'RESOLVED'; readonly transaction: Transaction }
  | { readonly status: 'AMBIGUOUS'; readonly transactions: readonly Transaction[] }
  | { readonly status: 'NOT_FOUND' };

export interface TargetContext {
  readonly members: readonly MemberOption[];
  readonly categoryNames: ReadonlyMap<string, string>;
  readonly today: IsoDate;
}

export function resolveCorrectionTarget(
  recent: readonly Transaction[],
  target: CorrectionTarget,
  context: TargetContext,
): TargetResolution {
  const [newest] = recent;
  if (newest === undefined) {
    return { status: 'NOT_FOUND' };
  }
  const latestBatch = recent
    .filter((transaction) => transaction.sourceMessageId === newest.sourceMessageId)
    .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime());
  const matches = (transaction: Transaction): boolean =>
    matchesTarget(transaction, target, context);
  if (target.ordinal !== null) {
    const chosen = latestBatch[target.ordinal - 1];
    return chosen !== undefined && matches(chosen)
      ? { status: 'RESOLVED', transaction: chosen }
      : { status: 'NOT_FOUND' };
  }
  const inBatch = latestBatch.filter(matches);
  const candidates = inBatch.length > 0 || !hasFilters(target) ? inBatch : recent.filter(matches);
  const [only, ...others] = candidates;
  if (only === undefined) {
    return { status: 'NOT_FOUND' };
  }
  return others.length === 0
    ? { status: 'RESOLVED', transaction: only }
    : { status: 'AMBIGUOUS', transactions: candidates.slice(0, MAXIMUM_OPTIONS) };
}

function hasFilters(target: CorrectionTarget): boolean {
  return (
    target.merchant !== null ||
    target.amount !== null ||
    target.member !== null ||
    target.date.kind !== 'UNSPECIFIED'
  );
}

function matchesTarget(
  transaction: Transaction,
  target: CorrectionTarget,
  context: TargetContext,
): boolean {
  return (
    matchesPlace(transaction, target.merchant, context.categoryNames) &&
    matchesAmount(transaction, target.amount) &&
    matchesMember(transaction, target.member, context.members) &&
    matchesDate(transaction, target, context.today)
  );
}

function matchesPlace(
  transaction: Transaction,
  mention: string | null,
  categoryNames: ReadonlyMap<string, string>,
): boolean {
  if (mention === null) {
    return true;
  }
  const wanted = comparableName(mention);
  const category =
    transaction.categoryId === null ? '' : (categoryNames.get(transaction.categoryId) ?? '');
  return [transaction.merchant ?? '', transaction.description ?? '', category].some(
    (text) => text !== '' && comparableName(text).includes(wanted),
  );
}

function matchesAmount(transaction: Transaction, amount: string | null): boolean {
  if (amount === null) {
    return true;
  }
  return parseMoneyInput(amount, transaction.currency) === transaction.amountMinor;
}

function matchesMember(
  transaction: Transaction,
  member: string | null,
  members: readonly MemberOption[],
): boolean {
  if (member === null) {
    return true;
  }
  const resolution = resolveMentionedMember(member, members);
  return resolution.status === 'RESOLVED' && resolution.member.id === transaction.memberId;
}

function matchesDate(transaction: Transaction, target: CorrectionTarget, today: IsoDate): boolean {
  if (target.date.kind === 'UNSPECIFIED') {
    return true;
  }
  return resolveDateReference(target.date, today) === transaction.transactionDate;
}
