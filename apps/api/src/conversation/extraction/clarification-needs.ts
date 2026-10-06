import type { Locale } from '../../i18n/locale.js';
import type { TransactionType } from '../../transactions/transaction-vocabulary.js';
import type { ClarificationReason } from './transaction-extraction.service.js';

type Wording = Readonly<Record<Locale, string>>;

const TYPE: Wording = {
  en: 'whether it was money spent, received or moved between accounts',
  'pt-BR': 'se foi um gasto, uma receita ou uma transferência entre contas',
};
const AMOUNT: Wording = { en: 'the amount', 'pt-BR': 'o valor' };
const CURRENCY: Wording = {
  en: 'the currency, such as euros or reais',
  'pt-BR': 'a moeda, por exemplo euros ou reais',
};
const ACCOUNT_IN_CURRENCY: Wording = {
  en: 'which account to record it in, because the usual account is in another currency',
  'pt-BR': 'em qual conta registrar, porque a conta de costume é de outra moeda',
};
const CATEGORY: Wording = { en: 'the category', 'pt-BR': 'a categoria' };
const FITTING_CATEGORY: Wording = {
  en: 'a category that fits what it was',
  'pt-BR': 'uma categoria que combine com o lançamento',
};
const ACCOUNT: Wording = { en: 'which account it was', 'pt-BR': 'em qual conta foi' };
const DESTINATION: Wording = {
  en: 'which account the money went to',
  'pt-BR': 'para qual conta o dinheiro foi',
};
const DESTINATION_IN_CURRENCY: Wording = {
  en: 'a destination account in the same currency',
  'pt-BR': 'uma conta de destino na mesma moeda',
};
const DISTINCT_ACCOUNTS: Wording = {
  en: 'two different accounts for the transfer',
  'pt-BR': 'duas contas diferentes para a transferência',
};
const DATE: Wording = { en: 'the date', 'pt-BR': 'a data' };
const PAST_DATE: Wording = {
  en: 'a date that is not in the future',
  'pt-BR': 'uma data que não esteja no futuro',
};
const CONFIRMATION: Wording = {
  en: 'a confirmation that this is what was meant',
  'pt-BR': 'a confirmação de que foi isso mesmo',
};
const DETAILS: Wording = { en: 'the details again', 'pt-BR': 'os detalhes de novo' };
const GOAL_CURRENCY: Wording = {
  en: 'an account in the same currency as the goal this transaction counts toward',
  'pt-BR': 'uma conta na mesma moeda da meta em que este lançamento conta',
};
const OWNER: Wording = { en: 'who it belongs to', 'pt-BR': 'de quem é' };

const NEEDS: Readonly<Record<ClarificationReason, Wording>> = {
  MISSING_TYPE: TYPE,
  MISSING_AMOUNT: AMOUNT,
  INVALID_AMOUNT: AMOUNT,
  UNSUPPORTED_CURRENCY: CURRENCY,
  CURRENCY_MISMATCH: ACCOUNT_IN_CURRENCY,
  ACCOUNT_CURRENCY_MISMATCH: ACCOUNT_IN_CURRENCY,
  MISSING_CATEGORY: CATEGORY,
  UNKNOWN_CATEGORY: CATEGORY,
  CATEGORY_KIND_MISMATCH: FITTING_CATEGORY,
  UNKNOWN_ACCOUNT: ACCOUNT,
  AMBIGUOUS_ACCOUNT: ACCOUNT,
  MISSING_TRANSFER_ACCOUNT: DESTINATION,
  UNKNOWN_TRANSFER_ACCOUNT: DESTINATION,
  AMBIGUOUS_TRANSFER_ACCOUNT: DESTINATION,
  TRANSFER_WITHOUT_DESTINATION: DESTINATION,
  TRANSFER_CURRENCY_MISMATCH: DESTINATION_IN_CURRENCY,
  TRANSFER_TO_SAME_ACCOUNT: DISTINCT_ACCOUNTS,
  TRANSFER_WITH_CATEGORY: TYPE,
  DESTINATION_WITHOUT_TRANSFER: TYPE,
  TYPE_CHANGE_NOT_ALLOWED: TYPE,
  UNRESOLVABLE_DATE: DATE,
  FUTURE_DATE: PAST_DATE,
  LOW_CONFIDENCE: CONFIRMATION,
  INVALID_INPUT: DETAILS,
  UNKNOWN_MEMBER: OWNER,
  GOAL_CURRENCY_MISMATCH: GOAL_CURRENCY,
};

const KINDS: Readonly<Record<Locale, Readonly<Record<TransactionType, string>>>> = {
  en: { EXPENSE: 'expense', INCOME: 'income', TRANSFER: 'transfer between accounts' },
  'pt-BR': { EXPENSE: 'gasto', INCOME: 'receita', TRANSFER: 'transferência entre contas' },
};

export function describeNeeds(reasons: readonly ClarificationReason[], locale: Locale): string[] {
  return [...new Set(reasons.map((reason) => NEEDS[reason][locale]))];
}

export function describeKind(type: TransactionType | null, locale: Locale): string | null {
  return type === null ? null : KINDS[locale][type];
}

export function describeDate(date: string | undefined, locale: Locale): string | null {
  if (date === undefined) {
    return null;
  }
  if (locale === 'pt-BR') {
    const [year, month, day] = date.split('-');
    return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
  }
  return date;
}

export function describeStoredNeeds(reasons: readonly string[], locale: Locale): string[] {
  return describeNeeds(
    reasons.filter((reason): reason is ClarificationReason => Object.hasOwn(NEEDS, reason)),
    locale,
  );
}
