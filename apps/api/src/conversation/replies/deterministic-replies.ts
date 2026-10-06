import type { Locale } from '../../i18n/locale.js';
import type { TransactionSummary } from './transaction-summary.js';

interface Wording {
  readonly recorded: string;
  readonly recordedMany: (count: number) => string;
  readonly alreadyRecorded: string;
  readonly expenseAt: (amount: string, merchant: string) => string;
  readonly incomeOf: (amount: string) => string;
  readonly incomeFrom: (merchant: string) => string;
  readonly transferOf: (amount: string, from: string, to: string) => string;
  readonly account: (name: string) => string;
  readonly forMember: (name: string) => string;
  readonly on: (date: string) => string;
  readonly acknowledged: string;
  readonly notRecorded: string;
  readonly stillNeeded: (needs: string) => string;
  readonly unknownAccount: string;
  readonly corrected: string;
  readonly deleted: string;
  readonly confirmDeletion: (line: string) => string;
  readonly keptTransaction: string;
  readonly whichOne: string;
  readonly whichOneHint: string;
  readonly notFound: string;
  readonly stale: string;
  readonly unchanged: (line: string) => string;
  readonly notCorrected: (needs: string) => string;
  readonly contributed: (added: string, goal: string) => string;
  readonly progress: (saved: string, target: string, share: string) => string;
  readonly goalReached: string;
  readonly whichGoal: (options: string) => string;
  readonly noGoals: string;
  readonly goalCurrency: (goal: string, goalCurrency: string, currency: string) => string;
  readonly alreadyContributed: (goal: string) => string;
  readonly contributionAmount: string;
  readonly contributionMember: string;
}

const WORDING: Readonly<Record<Locale, Wording>> = {
  en: {
    recorded: 'Recorded',
    recordedMany: (count) => `Recorded ${String(count)} transactions:`,
    alreadyRecorded: 'This receipt was already recorded',
    expenseAt: (amount, merchant) => `${amount} at ${merchant}`,
    incomeOf: (amount) => `income of ${amount}`,
    incomeFrom: (merchant) => ` from ${merchant}`,
    transferOf: (amount, from, to) => `transfer of ${amount} from ${from} to ${to}`,
    account: (name) => `account ${name}`,
    forMember: (name) => `for ${name}`,
    on: (date) => `on ${date}`,
    acknowledged: 'All right.',
    notRecorded: 'All right, nothing was recorded.',
    stillNeeded: (needs) => `To record it I still need ${needs}.`,
    unknownAccount: 'another account',
    corrected: 'Corrected',
    deleted: 'Deleted',
    confirmDeletion: (line) => `Delete this transaction: ${line}? Reply yes or no.`,
    keptTransaction: 'All right, nothing was deleted.',
    whichOne: 'Which one?',
    whichOneHint: 'Tell me the merchant or the amount.',
    notFound:
      'I could not find that transaction among the ones recorded in this conversation. Older ones can be corrected in the dashboard, under Transactions.',
    stale: 'That transaction has just changed. Check it and tell me again what to correct.',
    unchanged: (line) => `Nothing changed, it was already recorded this way: ${line}.`,
    notCorrected: (needs) => `Nothing was changed: I need ${needs}.`,
    contributed: (added, goal) => `Added ${added} to the goal ${goal}.`,
    progress: (saved, target, share) => `Progress: ${saved} of ${target} (${share}).`,
    goalReached: 'Goal reached.',
    whichGoal: (options) => `Which goal? ${options}.`,
    noGoals: 'There are no goals yet. Create one in the dashboard, under Goals.',
    goalCurrency: (goal, goalCurrency, currency) =>
      `The goal ${goal} is in ${goalCurrency} and this amount is in ${currency}, so I did not add it.`,
    alreadyContributed: (goal) => `That transaction already counts toward the goal ${goal}.`,
    contributionAmount: 'Tell me the amount to add to the goal.',
    contributionMember: 'Tell me who it came from, by name.',
  },
  'pt-BR': {
    recorded: 'Registrado',
    recordedMany: (count) => `Registrei ${String(count)} lançamentos:`,
    alreadyRecorded: 'Este recibo já estava registrado',
    expenseAt: (amount, merchant) => `${amount} em ${merchant}`,
    incomeOf: (amount) => `receita de ${amount}`,
    incomeFrom: (merchant) => ` de ${merchant}`,
    transferOf: (amount, from, to) =>
      `transferência de ${amount} da conta ${from} para a conta ${to}`,
    account: (name) => `conta ${name}`,
    forMember: (name) => `para ${name}`,
    on: (date) => `em ${date}`,
    acknowledged: 'Combinado.',
    notRecorded: 'Certo, não registrei.',
    stillNeeded: (needs) => `Para registrar, ainda preciso saber ${needs}.`,
    unknownAccount: 'outra conta',
    corrected: 'Corrigido',
    deleted: 'Apagado',
    confirmDeletion: (line) => `Apagar este lançamento: ${line}? Responda sim ou não.`,
    keptTransaction: 'Certo, não apaguei nada.',
    whichOne: 'Qual deles?',
    whichOneHint: 'Diga o estabelecimento ou o valor.',
    notFound:
      'Não encontrei esse lançamento entre os registrados nesta conversa. Os mais antigos você corrige no painel, em Movimentos.',
    stale: 'Esse lançamento acabou de mudar. Confira e me diga de novo o que corrigir.',
    unchanged: (line) => `Nada mudou, o lançamento já estava assim: ${line}.`,
    notCorrected: (needs) => `Não alterei nada, porque preciso saber ${needs}.`,
    contributed: (added, goal) => `Somei ${added} à meta ${goal}.`,
    progress: (saved, target, share) => `Progresso: ${saved} de ${target} (${share}).`,
    goalReached: 'Meta atingida.',
    whichGoal: (options) => `Qual meta? ${options}.`,
    noGoals: 'Ainda não há metas. Crie uma no painel, em Metas.',
    goalCurrency: (goal, goalCurrency, currency) =>
      `A meta ${goal} é em ${goalCurrency} e este valor é em ${currency}, então não somei.`,
    alreadyContributed: (goal) => `Esse lançamento já conta na meta ${goal}.`,
    contributionAmount: 'Me diga o valor para somar à meta.',
    contributionMember: 'Me diga de quem veio, pelo nome.',
  },
};

export function displayDate(isoDate: string, today: string, locale: Locale): string {
  if (locale === 'en') {
    return isoDate;
  }
  const [year, month, day] = isoDate.split('-');
  const sameYear = year === today.slice(0, 4);
  return sameYear ? `${day ?? ''}/${month ?? ''}` : `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

export function describeTransactionLine(
  summary: TransactionSummary,
  locale: Locale,
  today: string,
): string {
  const words = WORDING[locale];
  const account = summary.account ?? words.unknownAccount;
  const parts: string[] = [];
  if (summary.type === 'TRANSFER') {
    parts.push(
      words.transferOf(summary.amount, account, summary.transferTo ?? words.unknownAccount),
    );
  } else {
    const place = summary.merchant ?? summary.category;
    const income = `${words.incomeOf(summary.amount)}${
      summary.merchant === null ? '' : words.incomeFrom(summary.merchant)
    }`;
    const expense = place === null ? summary.amount : words.expenseAt(summary.amount, place);
    const head = summary.type === 'INCOME' ? income : expense;
    const { category } = summary;
    const showCategory =
      category !== null && (summary.type === 'INCOME' || summary.merchant !== null);
    parts.push(showCategory ? `${head} (${category})` : head);
    parts.push(words.account(account));
  }
  if (summary.forMember !== null) {
    parts.push(words.forMember(summary.forMember));
  }
  parts.push(words.on(displayDate(summary.date, today, locale)));
  return parts.join(', ');
}

export function recordedReply(
  summaries: readonly TransactionSummary[],
  locale: Locale,
  today: string,
): string {
  const words = WORDING[locale];
  const lines = summaries.map((summary) => describeTransactionLine(summary, locale, today));
  if (lines.length === 1) {
    return `${words.recorded}: ${lines[0] ?? ''}.`;
  }
  return [words.recordedMany(lines.length), ...lines.map((line) => `${capitalize(line)}.`)].join(
    '\n',
  );
}

export function alreadyRecordedReply(
  summary: TransactionSummary,
  locale: Locale,
  today: string,
): string {
  return `${WORDING[locale].alreadyRecorded}: ${describeTransactionLine(summary, locale, today)}.`;
}

export function acknowledgementReply(locale: Locale): string {
  return WORDING[locale].acknowledged;
}

export function discardedReply(locale: Locale): string {
  return WORDING[locale].notRecorded;
}

function joinNeeds(needs: readonly string[], locale: Locale): string {
  return needs.length < 2
    ? (needs[0] ?? '')
    : `${needs.slice(0, -1).join(', ')} ${locale === 'en' ? 'and' : 'e'} ${needs.at(-1) ?? ''}`;
}

export function stillNeededReply(needs: readonly string[], locale: Locale): string {
  return WORDING[locale].stillNeeded(joinNeeds(needs, locale));
}

export function correctedReply(summary: TransactionSummary, locale: Locale, today: string): string {
  return `${WORDING[locale].corrected}: ${describeTransactionLine(summary, locale, today)}.`;
}

export function deletedReply(summary: TransactionSummary, locale: Locale, today: string): string {
  return `${WORDING[locale].deleted}: ${describeTransactionLine(summary, locale, today)}.`;
}

export function confirmDeletionReply(
  summary: TransactionSummary,
  locale: Locale,
  today: string,
): string {
  return WORDING[locale].confirmDeletion(describeTransactionLine(summary, locale, today));
}

export function keptTransactionReply(locale: Locale): string {
  return WORDING[locale].keptTransaction;
}

export function whichOneReply(
  summaries: readonly TransactionSummary[],
  locale: Locale,
  today: string,
): string {
  const words = WORDING[locale];
  return [
    words.whichOne,
    ...summaries.map(
      (summary) => `${capitalize(describeTransactionLine(summary, locale, today))}.`,
    ),
    words.whichOneHint,
  ].join('\n');
}

export function notFoundReply(locale: Locale): string {
  return WORDING[locale].notFound;
}

export function staleReply(locale: Locale): string {
  return WORDING[locale].stale;
}

export function unchangedReply(summary: TransactionSummary, locale: Locale, today: string): string {
  return WORDING[locale].unchanged(describeTransactionLine(summary, locale, today));
}

export function notCorrectedReply(needs: readonly string[], locale: Locale): string {
  return WORDING[locale].notCorrected(joinNeeds(needs, locale));
}

export interface ContributionReply {
  readonly goal: string;
  readonly added: string;
  readonly progress: {
    readonly saved: string;
    readonly target: string;
    readonly share: string;
    readonly completed: boolean;
  } | null;
}

export function contributedReply(contribution: ContributionReply, locale: Locale): string {
  const words = WORDING[locale];
  const { progress } = contribution;
  return [
    words.contributed(contribution.added, contribution.goal),
    ...(progress === null ? [] : [words.progress(progress.saved, progress.target, progress.share)]),
    ...(progress?.completed === true ? [words.goalReached] : []),
  ].join(' ');
}

export function whichGoalReply(options: readonly string[], locale: Locale): string {
  return options.length === 0
    ? WORDING[locale].noGoals
    : WORDING[locale].whichGoal(joinNeeds(options, locale));
}

export function goalCurrencyReply(
  goal: string,
  goalCurrency: string,
  currency: string,
  locale: Locale,
): string {
  return WORDING[locale].goalCurrency(goal, goalCurrency, currency);
}

export function alreadyContributedReply(goal: string, locale: Locale): string {
  return WORDING[locale].alreadyContributed(goal);
}

export function contributionAmountReply(locale: Locale): string {
  return WORDING[locale].contributionAmount;
}

export function contributionMemberReply(locale: Locale): string {
  return WORDING[locale].contributionMember;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
