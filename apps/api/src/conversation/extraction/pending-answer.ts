import type { TransactionCandidate } from '../../ai/interpretation/message-interpretation.schema.js';
import { resolveMentionedAccount, type AccountOption } from './account-resolution.js';
import { comparableName, resolveMentionedMember, type MemberOption } from './member-resolution.js';
import type { CategoryOption } from './transaction-draft.js';

const ACCOUNT_REASONS: ReadonlySet<string> = new Set([
  'UNKNOWN_ACCOUNT',
  'AMBIGUOUS_ACCOUNT',
  'CURRENCY_MISMATCH',
  'ACCOUNT_CURRENCY_MISMATCH',
]);
const TRANSFER_REASONS: ReadonlySet<string> = new Set([
  'MISSING_TRANSFER_ACCOUNT',
  'UNKNOWN_TRANSFER_ACCOUNT',
  'AMBIGUOUS_TRANSFER_ACCOUNT',
  'TRANSFER_CURRENCY_MISMATCH',
  'TRANSFER_TO_SAME_ACCOUNT',
]);
const CATEGORY_REASONS: ReadonlySet<string> = new Set([
  'MISSING_CATEGORY',
  'UNKNOWN_CATEGORY',
  'CATEGORY_KIND_MISMATCH',
]);
const MEMBER_REASONS: ReadonlySet<string> = new Set(['UNKNOWN_MEMBER']);
const MINIMUM_WORD_LENGTH = 3;

export interface PendingNeeds {
  readonly candidate: TransactionCandidate;
  readonly reasons: readonly string[];
}

export interface AnswerContext {
  readonly accounts: readonly AccountOption[];
  readonly categories: readonly CategoryOption[];
  readonly members: readonly MemberOption[];
  readonly senderId: string;
}

export function answerPendingTransaction(
  text: string,
  pending: PendingNeeds,
  context: AnswerContext,
): TransactionCandidate | undefined {
  const needs = (reasons: ReadonlySet<string>): boolean =>
    pending.reasons.some((reason) => reasons.has(reason));
  const account =
    needs(ACCOUNT_REASONS) || needs(TRANSFER_REASONS) ? mentionedAccount(text, context) : undefined;
  const category = needs(CATEGORY_REASONS)
    ? mentionedCategory(text, pending.candidate, context.categories)
    : undefined;
  const member = needs(MEMBER_REASONS) ? mentionedMember(text, context.members) : undefined;
  if (account === undefined && category === undefined && member === undefined) {
    return undefined;
  }
  return {
    ...pending.candidate,
    ...(account === undefined
      ? {}
      : needs(ACCOUNT_REASONS)
        ? { account: account.name }
        : { transferAccount: account.name }),
    ...(category === undefined ? {} : { category: category.name }),
    ...(member === undefined ? {} : { member: member.name }),
  };
}

function mentionedMember(text: string, members: readonly MemberOption[]): MemberOption | undefined {
  const found = new Set(
    phrases(text).flatMap((phrase) => {
      const resolution = resolveMentionedMember(phrase, members);
      return resolution.status === 'RESOLVED' ? [resolution.member.id] : [];
    }),
  );
  const [only, ...others] = [...found];
  return only === undefined || others.length > 0
    ? undefined
    : members.find((member) => member.id === only);
}

const plain = comparableName;

function phrases(text: string): string[] {
  const whole = plain(text);
  const words = whole.split(' ').filter((word) => word.length >= MINIMUM_WORD_LENGTH);
  return [whole, ...words.filter((word) => word !== whole)];
}

function mentionedAccount(text: string, context: AnswerContext): AccountOption | undefined {
  const comparable = context.accounts.map((account) => ({ ...account, name: plain(account.name) }));
  const resolve = (phrase: string): string | undefined => {
    const resolution = resolveMentionedAccount(phrase, comparable, context.senderId);
    return resolution.status === 'RESOLVED' ? resolution.account.id : undefined;
  };
  const [whole, ...words] = phrases(text);
  const wholeMatch = whole === undefined ? undefined : resolve(whole);
  const wordMatches = [...new Set(words.flatMap((word) => resolve(word) ?? []))];
  const chosen = wholeMatch ?? (wordMatches.length === 1 ? wordMatches[0] : undefined);
  return context.accounts.find((account) => account.id === chosen);
}

function mentionedCategory(
  text: string,
  candidate: TransactionCandidate,
  categories: readonly CategoryOption[],
): CategoryOption | undefined {
  const kind = candidate.type === 'INCOME' ? 'INCOME' : 'EXPENSE';
  const eligible = categories.filter((category) => category.kind === kind);
  for (const phrase of phrases(text)) {
    const exact = eligible.filter((category) => plain(category.name) === phrase);
    const partial = eligible.filter((category) => plain(category.name).startsWith(phrase));
    const matches = exact.length > 0 ? exact : partial;
    const [only, ...others] = matches;
    if (only !== undefined && others.length === 0) {
      return only;
    }
  }
  return undefined;
}
