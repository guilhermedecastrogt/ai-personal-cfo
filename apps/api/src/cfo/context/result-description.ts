import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.js';
import { formatBasisPoints, formatMoney } from '../../money/format-money.js';

export interface NameDirectory {
  readonly members: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, string>;
  readonly accounts: ReadonlyMap<string, string>;
  readonly goals: ReadonlyMap<string, string>;
  readonly locale?: Locale;
}

export interface AmountView {
  readonly minor: number;
  readonly text: string;
}

export interface RatioView {
  readonly basisPoints: number;
  readonly text: string;
}

interface Presentation {
  readonly directory: NameDirectory;
  money(amountMinor: number, currency: string): unknown;
  ratio(basisPoints: number): unknown;
}

interface FallbackNames {
  readonly unknown: string;
  readonly uncategorised: string;
  readonly joint: string;
}

const FALLBACK_NAMES: Readonly<Record<Locale, FallbackNames>> = {
  en: { unknown: 'Unknown', uncategorised: 'Uncategorised', joint: 'Joint' },
  'pt-BR': { unknown: 'Desconhecido', uncategorised: 'Sem categoria', joint: 'Conjunta' },
};
const MINOR_SUFFIX = 'Minor';
const BASIS_POINTS_SUFFIX = 'BasisPoints';
const OMITTED_KEYS: ReadonlySet<string> = new Set([
  'budgetId',
  'transactionId',
  'merchantKey',
  'key',
]);

export function localeOf(directory: NameDirectory): Locale {
  return directory.locale ?? DEFAULT_LOCALE;
}

export function describeResult(value: unknown, directory: NameDirectory): unknown {
  return describeValue(
    value,
    {
      directory,
      money: (minor, currency) => formatMoney(minor, currency, localeOf(directory)),
      ratio: (basisPoints) => formatBasisPoints(basisPoints, localeOf(directory)),
    },
    undefined,
  );
}

export function presentResult(value: unknown, directory: NameDirectory): unknown {
  const presentation: Presentation = {
    directory,
    money: (minor, currency): AmountView => ({
      minor,
      text: formatMoney(minor, currency, localeOf(directory)),
    }),
    ratio: (basisPoints): RatioView => ({
      basisPoints,
      text: formatBasisPoints(basisPoints, localeOf(directory)),
    }),
  };
  return describeValue(value, presentation, undefined);
}

function describeValue(
  value: unknown,
  presentation: Presentation,
  currency: string | undefined,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => describeValue(item, presentation, currency));
  }
  if (typeof value === 'object' && value !== null) {
    return describeObject(value as Record<string, unknown>, presentation, currency);
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  return null;
}

function describeObject(
  source: Record<string, unknown>,
  presentation: Presentation,
  inheritedCurrency: string | undefined,
): Record<string, unknown> {
  const currency = typeof source.currency === 'string' ? source.currency : inheritedCurrency;
  const described: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (!OMITTED_KEYS.has(key)) {
      const [label, content] = describeField(key, value, presentation, currency);
      described[label] = content;
    }
  }
  return described;
}

function describeField(
  key: string,
  value: unknown,
  presentation: Presentation,
  currency: string | undefined,
): [string, unknown] {
  const { directory } = presentation;
  const fallbackNames = FALLBACK_NAMES[localeOf(directory)];
  const UNKNOWN_NAME = fallbackNames.unknown;
  const UNCATEGORISED = fallbackNames.uncategorised;
  const JOINT_OWNER = fallbackNames.joint;
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
      return [
        'transferAccount',
        typeof value === 'string' ? nameOf(directory.accounts, UNKNOWN_NAME) : null,
      ];
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
    return [key.slice(0, -MINOR_SUFFIX.length), formatAmounts(value, currency, presentation)];
  }
  if (key.endsWith(BASIS_POINTS_SUFFIX)) {
    return [
      key.slice(0, -BASIS_POINTS_SUFFIX.length),
      typeof value === 'number' ? presentation.ratio(value) : null,
    ];
  }
  return [key, describeValue(value, presentation, currency)];
}

function formatAmounts(value: unknown, currency: string, presentation: Presentation): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => formatAmounts(item, currency, presentation));
  }
  return typeof value === 'number' ? presentation.money(value, currency) : null;
}
