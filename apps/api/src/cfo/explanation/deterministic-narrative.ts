import type { ReplyFacts } from '../../ai/ai-provider.js';
import type { ReviewNarrative } from '../../ai/review/review-narrative.schema.js';
import { DEFAULT_LOCALE, type Locale } from '../../i18n/locale.js';

const MAXIMUM_PRIORITIES = 3;

type Facts = Readonly<Record<string, unknown>>;

function field(facts: Facts, key: string): string {
  const value = facts[key];
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : 'an unknown value';
}

function child(facts: Facts, key: string): Facts {
  const value = facts[key];
  return typeof value === 'object' && value !== null ? (value as Facts) : {};
}

function findingsOf(review: Facts): Facts[] {
  const findings = review.findings;
  return Array.isArray(findings) ? (findings as Facts[]) : [];
}

type Statement = (facts: Facts) => string;

interface NarrativeWording {
  readonly statements: Readonly<Record<string, Statement>>;
  readonly suggestions: Readonly<Record<string, Statement>>;
  noTransactions(currency: string, period: string): string;
  period(start: string, end: string): string;
  totals(period: string, income: string, expenses: string, net: string): string;
  savingsRate(rate: string): string;
  dataThrough(date: string): string;
  readonly noComparison: string;
}

const ENGLISH: NarrativeWording = {
  statements: {
    POSITIVE_CASH_FLOW: (facts) => `Income exceeded spending by ${field(facts, 'net')}.`,
    HEALTHY_SAVINGS_RATE: (facts) => `The savings rate is ${field(facts, 'savingsRate')}.`,
    SPENDING_DECREASED: (facts) =>
      `Spending is down ${field(facts, 'change')} (${field(facts, 'difference')}) on the previous period.`,
    BUDGETS_ON_TRACK: () => 'Every budget is within its limit.',
    GOAL_COMPLETED: (facts) =>
      `The goal ${field(facts, 'goal')} has reached its target of ${field(facts, 'target')}.`,
    NEGATIVE_CASH_FLOW: (facts) =>
      `Spending exceeded income. Net cash flow is ${field(facts, 'net')}.`,
    LOW_SAVINGS_RATE: (facts) => `The savings rate is ${field(facts, 'savingsRate')}.`,
    SPENDING_INCREASED: (facts) =>
      `Spending is up ${field(facts, 'change')} (${field(facts, 'difference')}) on the previous period.`,
    CATEGORY_SPENDING_INCREASED: (facts) =>
      `${field(facts, 'category')} spending rose from ${field(facts, 'previous')} to ${field(facts, 'current')} (${field(facts, 'change')}).`,
    BUDGET_EXCEEDED: (facts) =>
      `The ${field(facts, 'category')} budget of ${field(facts, 'limit')} is exceeded, with ${field(facts, 'spent')} spent (${field(facts, 'usage')}).`,
    BUDGET_NEAR_LIMIT: (facts) =>
      `The ${field(facts, 'category')} budget is at ${field(facts, 'usage')}, with ${field(facts, 'spent')} of ${field(facts, 'limit')} spent.`,
    BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
      `The ${field(facts, 'category')} budget of ${field(facts, 'limit')} is projected to reach ${field(facts, 'projectedTotal')}.`,
    UNUSUAL_SPENDING: (facts) =>
      `${field(facts, 'category')} had unusual spending of ${field(facts, 'amount')}, against a usual ${field(facts, 'usual')}.`,
    GOAL_OVERDUE: (facts) =>
      `The goal ${field(facts, 'goal')} is past its date with ${field(facts, 'remaining')} still to save.`,
    PROJECTED_SHORTFALL: (facts) =>
      `Projected spending of ${field(facts, 'projectedExpenses')} exceeds expected income of ${field(facts, 'expectedIncome')} by ${field(facts, 'shortfall')}.`,
  },
  suggestions: {
    NEGATIVE_CASH_FLOW: () => 'Look for spending that can wait until more income arrives.',
    LOW_SAVINGS_RATE: () => 'Set an amount aside for savings at the start of the month.',
    SPENDING_INCREASED: () => 'Check which categories drove the increase in spending.',
    CATEGORY_SPENDING_INCREASED: (facts) =>
      `Check what drove the increase in ${field(facts, 'category')}.`,
    BUDGET_EXCEEDED: (facts) =>
      `Hold back on ${field(facts, 'category')} for the rest of the period, or adjust the budget.`,
    BUDGET_NEAR_LIMIT: (facts) =>
      `Keep an eye on ${field(facts, 'category')} for the rest of the period.`,
    BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
      `Slow ${field(facts, 'category')} spending to stay within the budget.`,
    UNUSUAL_SPENDING: (facts) =>
      `Confirm the unusual ${field(facts, 'category')} spending was expected.`,
    GOAL_OVERDUE: (facts) => `Set a new date or amount for the goal ${field(facts, 'goal')}.`,
    PROJECTED_SHORTFALL: () => 'Plan how the projected shortfall will be covered.',
  },
  noTransactions: (currency, period) =>
    `No transactions are recorded in ${currency} for ${period}.`,
  period: (start, end) => `${start} to ${end}`,
  totals: (period, income, expenses, net) =>
    `For ${period}, income was ${income} and spending was ${expenses}, leaving ${net}.`,
  savingsRate: (rate) => `The savings rate is ${rate}.`,
  dataThrough: (date) => `These figures run through ${date}.`,
  noComparison: 'There is no earlier period to compare with yet.',
};

const PORTUGUESE: NarrativeWording = {
  statements: {
    POSITIVE_CASH_FLOW: (facts) => `As receitas superaram os gastos em ${field(facts, 'net')}.`,
    HEALTHY_SAVINGS_RATE: (facts) => `A taxa de poupança está em ${field(facts, 'savingsRate')}.`,
    SPENDING_DECREASED: (facts) =>
      `Os gastos caíram ${field(facts, 'change')} (${field(facts, 'difference')}) em relação ao período anterior.`,
    BUDGETS_ON_TRACK: () => 'Todos os orçamentos estão dentro do limite.',
    GOAL_COMPLETED: (facts) =>
      `A meta ${field(facts, 'goal')} atingiu o valor de ${field(facts, 'target')}.`,
    NEGATIVE_CASH_FLOW: (facts) =>
      `Os gastos superaram as receitas. O saldo do período é ${field(facts, 'net')}.`,
    LOW_SAVINGS_RATE: (facts) => `A taxa de poupança está em ${field(facts, 'savingsRate')}.`,
    SPENDING_INCREASED: (facts) =>
      `Os gastos subiram ${field(facts, 'change')} (${field(facts, 'difference')}) em relação ao período anterior.`,
    CATEGORY_SPENDING_INCREASED: (facts) =>
      `Os gastos com ${field(facts, 'category')} passaram de ${field(facts, 'previous')} para ${field(facts, 'current')} (${field(facts, 'change')}).`,
    BUDGET_EXCEEDED: (facts) =>
      `O orçamento de ${field(facts, 'category')}, de ${field(facts, 'limit')}, foi ultrapassado, com ${field(facts, 'spent')} gastos (${field(facts, 'usage')}).`,
    BUDGET_NEAR_LIMIT: (facts) =>
      `O orçamento de ${field(facts, 'category')} está em ${field(facts, 'usage')}, com ${field(facts, 'spent')} gastos de ${field(facts, 'limit')}.`,
    BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
      `O orçamento de ${field(facts, 'category')}, de ${field(facts, 'limit')}, deve chegar a ${field(facts, 'projectedTotal')}.`,
    UNUSUAL_SPENDING: (facts) =>
      `Houve um gasto incomum em ${field(facts, 'category')}, de ${field(facts, 'amount')}, quando o habitual é ${field(facts, 'usual')}.`,
    GOAL_OVERDUE: (facts) =>
      `A meta ${field(facts, 'goal')} passou do prazo e ainda faltam ${field(facts, 'remaining')}.`,
    PROJECTED_SHORTFALL: (facts) =>
      `Os gastos previstos, de ${field(facts, 'projectedExpenses')}, superam a receita esperada, de ${field(facts, 'expectedIncome')}, em ${field(facts, 'shortfall')}.`,
  },
  suggestions: {
    NEGATIVE_CASH_FLOW: () => 'Vale adiar o que puder esperar até a próxima entrada de dinheiro.',
    LOW_SAVINGS_RATE: () => 'Separe um valor para a poupança logo no início do mês.',
    SPENDING_INCREASED: () => 'Veja quais categorias puxaram o aumento dos gastos.',
    CATEGORY_SPENDING_INCREASED: (facts) =>
      `Veja o que explica o aumento em ${field(facts, 'category')}.`,
    BUDGET_EXCEEDED: (facts) =>
      `Segure os gastos com ${field(facts, 'category')} até o fim do período, ou ajuste o orçamento.`,
    BUDGET_NEAR_LIMIT: (facts) =>
      `Acompanhe ${field(facts, 'category')} de perto até o fim do período.`,
    BUDGET_PROJECTED_OVER_LIMIT: (facts) =>
      `Reduza o ritmo em ${field(facts, 'category')} para ficar dentro do orçamento.`,
    UNUSUAL_SPENDING: (facts) =>
      `Confirme se o gasto incomum em ${field(facts, 'category')} era esperado.`,
    GOAL_OVERDUE: (facts) => `Defina um novo prazo ou valor para a meta ${field(facts, 'goal')}.`,
    PROJECTED_SHORTFALL: () => 'Planeje como cobrir a diferença prevista.',
  },
  noTransactions: (currency, period) =>
    `Não há transações registradas em ${currency} entre ${period}.`,
  period: (start, end) => `${start} e ${end}`,
  totals: (period, income, expenses, net) =>
    `Entre ${period}, as receitas foram ${income} e os gastos ${expenses}, um saldo de ${net}.`,
  savingsRate: (rate) => `A taxa de poupança está em ${rate}.`,
  dataThrough: (date) => `Os números vão até ${date}.`,
  noComparison: 'Ainda não há um período anterior para comparar.',
};

const WORDING: Readonly<Record<Locale, NarrativeWording>> = { en: ENGLISH, 'pt-BR': PORTUGUESE };

function summarize(review: Facts, words: NarrativeWording): string {
  const month = child(review, 'month');
  const totals = child(review, 'totals');
  const period = words.period(field(month, 'start'), field(month, 'end'));
  if (review.transactionsRecorded === 0) {
    return words.noTransactions(field(review, 'currency'), period);
  }
  const sentences = [
    words.totals(
      period,
      field(totals, 'income'),
      field(totals, 'expenses'),
      field(totals, 'netCashFlow'),
    ),
  ];
  if (typeof totals.savingsRate === 'string') {
    sentences.push(words.savingsRate(totals.savingsRate));
  }
  if (review.monthIsComplete === false) {
    sentences.push(words.dataThrough(field(review, 'dataThrough')));
  }
  if (review.comparisonAvailable === false) {
    sentences.push(words.noComparison);
  }
  return sentences.join(' ');
}

function statementsOf(
  review: Facts,
  kind: 'STRENGTH' | 'CONCERN',
  words: NarrativeWording,
): string[] {
  return findingsOf(review)
    .filter((finding) => finding.kind === kind)
    .map((finding) => words.statements[field(finding, 'code')]?.(finding))
    .filter((statement) => statement !== undefined);
}

function suggestionsOf(review: Facts, words: NarrativeWording): string[] {
  const suggestions = findingsOf(review)
    .map((finding) => words.suggestions[field(finding, 'code')]?.(finding))
    .filter((suggestion) => suggestion !== undefined);
  return [...new Set(suggestions)];
}

export interface FindingStatement {
  readonly kind: 'STRENGTH' | 'CONCERN';
  readonly code: string;
  readonly statement: string;
}

export function describeFindings(
  review: ReplyFacts,
  locale: Locale = DEFAULT_LOCALE,
): FindingStatement[] {
  return findingsOf(review).flatMap((finding) => {
    const code = field(finding, 'code');
    const statement = WORDING[locale].statements[code]?.(finding);
    const kind = finding.kind === 'STRENGTH' ? 'STRENGTH' : 'CONCERN';
    return statement === undefined ? [] : [{ kind, code, statement }];
  });
}

export function renderDeterministicNarrative(
  reviews: readonly ReplyFacts[],
  locale: Locale = DEFAULT_LOCALE,
): ReviewNarrative {
  const words = WORDING[locale];
  const recommendations = reviews.flatMap((review) => suggestionsOf(review, words));
  return {
    summary: reviews.map((review) => summarize(review, words)).join(' '),
    strengths: reviews.flatMap((review) => statementsOf(review, 'STRENGTH', words)),
    concerns: reviews.flatMap((review) => statementsOf(review, 'CONCERN', words)),
    recommendations,
    priorities: recommendations.slice(0, MAXIMUM_PRIORITIES),
  };
}
