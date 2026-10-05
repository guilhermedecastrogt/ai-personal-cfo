import { formatBasisPoints, formatMoney } from '../../money/format-money.js';

export interface NameDirectory {
  readonly members: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
  readonly accounts: ReadonlyMap<string, string>;
  readonly goals: ReadonlyMap<string, string>;
}

const UNKNOWN_NAME = 'Unknown';
const UNCATEGORISED = 'Uncategorised';
const JOINT_OWNER = 'Joint';
const MINOR_SUFFIX = 'Minor';
const BASIS_POINTS_SUFFIX = 'BasisPoints';
const OMITTED_KEYS: ReadonlySet<string> = new Set([
  'budgetId',
  'transactionId',
  'merchantKey',
  'key',
]);

export function describeResult(value: unknown, directory: NameDirectory): unknown {
  return describeValue(value, directory, undefined);
}

function describeValue(
  value: unknown,
  directory: NameDirectory,
  currency: string | undefined,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => describeValue(item, directory, currency));
  }
  if (typeof value === 'object' && value !== null) {
    return describeObject(value as Record<string, unknown>, directory, currency);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function describeObject(
  source: Record<string, unknown>,
  directory: NameDirectory,
  inheritedCurrency: string | undefined,
): Record<string, unknown> {
  const currency = typeof source.currency === 'string' ? source.currency : inheritedCurrency;
  const described: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!OMITTED_KEYS.has(key)) {
      const [label, content] = describeField(key, value, directory, currency);
      described[label] = content;
    }
  }
  return described;
}

function describeField(
  key: string,
  value: unknown,
  directory: NameDirectory,
  currency: string | undefined,
): [string, unknown] {
  const nameOf = (names: ReadonlyMap<string, string>, fallback: string): unknown =>
    typeof value === 'string' ? (names.get(value) ?? UNKNOWN_NAME) : fallback;
  switch (key) {
    case 'memberId':
      return ['member', nameOf(directory.members, UNKNOWN_NAME)];
    case 'ownerMemberId':
      return ['owner', nameOf(directory.members, JOINT_OWNER)];
    case 'categoryId':
      return ['category', nameOf(directory.categories, UNCATEGORISED)];
    case 'accountId':
      return ['account', nameOf(directory.accounts, UNKNOWN_NAME)];
    case 'transferAccountId':
      return ['transferAccount', nameOf(directory.accounts, UNKNOWN_NAME)];
    case 'goalId':
      return ['goal', nameOf(directory.goals, UNKNOWN_NAME)];
    case 'memberIds':
      return [
        'members',
        Array.isArray(value)
          ? value.map((id) => directory.members.get(String(id)) ?? UNKNOWN_NAME)
          : [],
      ];
  }
  if (key.endsWith(MINOR_SUFFIX) && currency !== undefined) {
    return [key.slice(0, -MINOR_SUFFIX.length), formatAmounts(value, currency)];
  }
  if (key.endsWith(BASIS_POINTS_SUFFIX)) {
    return [
      key.slice(0, -BASIS_POINTS_SUFFIX.length),
      typeof value === 'number' ? formatBasisPoints(value) : null,
    ];
  }
  return [key, describeValue(value, directory, currency)];
}

function formatAmounts(value: unknown, currency: string): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => formatAmounts(item, currency));
  }
  return typeof value === 'number' ? formatMoney(value, currency) : null;
}
