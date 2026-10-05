import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { RecurrenceFrequency } from '../../finance/domain/finance-policy.js';
import type { Insight } from '../../finance/domain/insights/insight-engine.js';
import type { Locale } from '../../i18n/locale.js';
import { describeResult, localeOf, type NameDirectory } from './result-description.js';

export interface SignalDescription {
  readonly type: string;
  readonly severity: Insight['severity'];
  readonly title: string;
  readonly detail: string;
  readonly date: string | null;
}

type Facts = Readonly<Record<string, unknown>>;

type Text = (facts: Facts, key: string) => string;

interface Wording {
  readonly allSpending: string;
  readonly unnamedMerchant: string;
  readonly frequency: Readonly<Record<RecurrenceFrequency, string>>;
  largeExpense(category: string): string;
  largeExpenseDetail(amount: string, merchant: string, usual: string): string;
  highSpending(category: string): string;
  highSpendingDetail(current: string, usual: string): string;
  budget(scope: string, exceeded: boolean): string;
  budgetDetail(spent: string, limit: string, usage: string): string;
  spendingUp(category: string): string;
  spendingUpDetail(current: string, previous: string, change: string): string;
  recurs(merchant: string, frequency: string): string;
  recursDetail(amount: string, lastDate: string): string;
  newRecurring(merchant: string): string;
  newRecurringDetail(amount: string, frequency: string, occurrences: string, since: string): string;
  costsMore(merchant: string): string;
  costsMoreDetail(current: string, previous: string, change: string, since: string): string;
  stopped(merchant: string): string;
  stoppedDetail(amount: string, frequency: string, lastDate: string, expected: string): string;
  goal(goal: string, completed: boolean): string;
  goalDetail(current: string, target: string, progress: string): string;
  readonly shortfall: string;
  shortfallDetail(projected: string, expected: string): string;
}

const WORDING: Readonly<Record<Locale, Wording>> = {
  en: {
    allSpending: 'All spending',
    unnamedMerchant: 'an unnamed merchant',
    frequency: { WEEKLY: 'weekly', MONTHLY: 'monthly', QUARTERLY: 'quarterly', YEARLY: 'yearly' },
    largeExpense: (category) => `Unusually large ${category} expense`,
    largeExpenseDetail: (amount, merchant, usual) =>
      `${amount} at ${merchant}, against a usual ${usual}.`,
    highSpending: (category) => `Unusually high ${category} spending`,
    highSpendingDetail: (current, usual) =>
      `${current} so far, against a usual ${usual} by this point.`,
    budget: (scope, exceeded) => `${scope} budget ${exceeded ? 'exceeded' : 'near its limit'}`,
    budgetDetail: (spent, limit, usage) => `${spent} of ${limit} spent (${usage}).`,
    spendingUp: (category) => `${category} spending is up`,
    spendingUpDetail: (current, previous, change) =>
      `${current} against ${previous} in the previous period (${change}).`,
    recurs: (merchant, frequency) => `${merchant} recurs ${frequency}`,
    recursDetail: (amount, lastDate) => `Typically ${amount}. Last charged on ${lastDate}.`,
    newRecurring: (merchant) => `New recurring expense: ${merchant}`,
    newRecurringDetail: (amount, frequency, occurrences, since) =>
      `${amount} ${frequency}, charged ${occurrences} times since ${since}.`,
    costsMore: (merchant) => `${merchant} costs more`,
    costsMoreDetail: (current, previous, change, since) =>
      `Now ${current}, previously ${previous} (${change} more), since ${since}.`,
    stopped: (merchant) => `${merchant} appears to have stopped`,
    stoppedDetail: (amount, frequency, lastDate, expected) =>
      `Usually ${amount} ${frequency}. Last charged on ${lastDate}, and nothing since it was expected on ${expected}.`,
    goal: (goal, completed) => `Goal ${goal} is ${completed ? 'complete' : 'overdue'}`,
    goalDetail: (current, target, progress) => `${current} saved of ${target} (${progress}).`,
    shortfall: 'Projected spending exceeds expected income',
    shortfallDetail: (projected, expected) =>
      `${projected} projected against ${expected} expected.`,
  },
  'pt-BR': {
    allSpending: 'Gastos totais',
    unnamedMerchant: 'um estabelecimento sem nome',
    frequency: {
      WEEKLY: 'por semana',
      MONTHLY: 'por mês',
      QUARTERLY: 'por trimestre',
      YEARLY: 'por ano',
    },
    largeExpense: (category) => `Gasto atípico em ${category}`,
    largeExpenseDetail: (amount, merchant, usual) =>
      `${amount} em ${merchant}, quando o habitual é ${usual}.`,
    highSpending: (category) => `Gastos acima do habitual em ${category}`,
    highSpendingDetail: (current, usual) =>
      `${current} até agora, quando o habitual nesta altura do mês é ${usual}.`,
    budget: (scope, exceeded) =>
      exceeded ? `Orçamento de ${scope} ultrapassado` : `Orçamento de ${scope} perto do limite`,
    budgetDetail: (spent, limit, usage) => `${spent} gastos de ${limit} (${usage}).`,
    spendingUp: (category) => `Gastos com ${category} em alta`,
    spendingUpDetail: (current, previous, change) =>
      `${current}, contra ${previous} no período anterior (${change}).`,
    recurs: (merchant, frequency) => `${merchant} se repete ${frequency}`,
    recursDetail: (amount, lastDate) => `Normalmente ${amount}. Última cobrança em ${lastDate}.`,
    newRecurring: (merchant) => `Nova despesa recorrente: ${merchant}`,
    newRecurringDetail: (amount, frequency, occurrences, since) =>
      `${amount} ${frequency}, cobrado ${occurrences} vezes desde ${since}.`,
    costsMore: (merchant) => `${merchant} ficou mais caro`,
    costsMoreDetail: (current, previous, change, since) =>
      `Agora ${current}, antes ${previous} (${change} a mais), desde ${since}.`,
    stopped: (merchant) => `${merchant} parece ter parado`,
    stoppedDetail: (amount, frequency, lastDate, expected) =>
      `Normalmente ${amount} ${frequency}. Última cobrança em ${lastDate}, e nada desde a data esperada, ${expected}.`,
    goal: (goal, completed) =>
      completed ? `Meta ${goal} concluída` : `Meta ${goal} com prazo vencido`,
    goalDetail: (current, target, progress) => `${current} guardados de ${target} (${progress}).`,
    shortfall: 'Gastos previstos acima da receita esperada',
    shortfallDetail: (projected, expected) =>
      `${projected} previstos, contra ${expected} esperados.`,
  },
};

const ANOMALY_SEVERITY = 'MEDIUM';

export function allSpendingLabel(locale: Locale): string {
  return WORDING[locale].allSpending;
}

const text: Text = (facts, key) => {
  const value = facts[key];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'unknown';
};

function describeAnomaly(
  anomaly: Anomaly,
  facts: Facts,
  words: Wording,
): Omit<SignalDescription, 'severity'> {
  if (anomaly.type === 'UNUSUALLY_LARGE_TRANSACTION') {
    return {
      type: anomaly.type,
      title: words.largeExpense(text(facts, 'category')),
      detail: words.largeExpenseDetail(
        text(facts, 'amount'),
        anomaly.merchant ?? words.unnamedMerchant,
        text(facts, 'baselineAmount'),
      ),
      date: anomaly.date,
    };
  }
  return {
    type: anomaly.type,
    title: words.highSpending(text(facts, 'category')),
    detail: words.highSpendingDetail(text(facts, 'currentAmount'), text(facts, 'baselineAmount')),
    date: null,
  };
}

export function describeAnomalies(
  anomalies: readonly Anomaly[],
  directory: NameDirectory,
): SignalDescription[] {
  const words = WORDING[localeOf(directory)];
  return anomalies.map((anomaly) => ({
    ...describeAnomaly(anomaly, describeResult(anomaly, directory) as Facts, words),
    severity: ANOMALY_SEVERITY,
  }));
}

function describeInsight(
  insight: Insight,
  directory: NameDirectory,
): Omit<SignalDescription, 'severity'> {
  const words = WORDING[localeOf(directory)];
  const facts = describeResult(insight.evidence, directory) as Facts;
  const date = null;
  switch (insight.type) {
    case 'BUDGET_NEAR_LIMIT':
    case 'BUDGET_EXCEEDED': {
      const scope =
        insight.evidence.categoryId === null ? words.allSpending : text(facts, 'category');
      return {
        type: insight.type,
        title: words.budget(scope, insight.type === 'BUDGET_EXCEEDED'),
        detail: words.budgetDetail(
          text(facts, 'spent'),
          text(facts, 'limit'),
          text(facts, 'usage'),
        ),
        date,
      };
    }
    case 'SPENDING_INCREASE':
      return {
        type: insight.type,
        title: words.spendingUp(text(facts, 'category')),
        detail: words.spendingUpDetail(
          text(facts, 'current'),
          text(facts, 'previous'),
          text(facts, 'change'),
        ),
        date,
      };
    case 'UNUSUAL_SPENDING':
      return describeAnomaly(insight.evidence, facts, words);
    case 'RECURRING_EXPENSE':
      return {
        type: insight.type,
        title: words.recurs(insight.evidence.merchant, words.frequency[insight.evidence.frequency]),
        detail: words.recursDetail(text(facts, 'typicalAmount'), insight.evidence.lastDate),
        date: insight.evidence.lastDate,
      };
    case 'NEW_RECURRING_EXPENSE':
      return {
        type: insight.type,
        title: words.newRecurring(insight.evidence.merchant),
        detail: words.newRecurringDetail(
          text(facts, 'typicalAmount'),
          words.frequency[insight.evidence.frequency],
          String(insight.evidence.occurrences),
          insight.evidence.firstDate,
        ),
        date: insight.evidence.establishedOn,
      };
    case 'RECURRING_PRICE_INCREASE': {
      const change = (facts.priceChange ?? {}) as Facts;
      return {
        type: insight.type,
        title: words.costsMore(insight.evidence.merchant),
        detail: words.costsMoreDetail(
          text(change, 'currentAmount'),
          text(change, 'previousAmount'),
          text(change, 'change'),
          text(change, 'effectiveDate'),
        ),
        date: insight.evidence.priceChange?.effectiveDate ?? null,
      };
    }
    case 'RECURRING_EXPENSE_STOPPED':
      return {
        type: insight.type,
        title: words.stopped(insight.evidence.merchant),
        detail: words.stoppedDetail(
          text(facts, 'typicalAmount'),
          words.frequency[insight.evidence.frequency],
          insight.evidence.lastDate,
          insight.evidence.nextExpectedDate,
        ),
        date: insight.evidence.lastDate,
      };
    case 'GOAL_PROGRESS':
      return {
        type: insight.type,
        title: words.goal(text(facts, 'goal'), insight.evidence.state === 'COMPLETED'),
        detail: words.goalDetail(
          text(facts, 'current'),
          text(facts, 'target'),
          text(facts, 'progress'),
        ),
        date: insight.evidence.targetDate,
      };
    case 'CASH_FLOW_WARNING':
      return {
        type: insight.type,
        title: words.shortfall,
        detail: words.shortfallDetail(
          text(facts, 'projectedExpenses'),
          text(facts, 'expectedIncome'),
        ),
        date,
      };
  }
}

export function describeInsights(
  insights: readonly Insight[],
  directory: NameDirectory,
): SignalDescription[] {
  return insights.map((insight) => ({
    ...describeInsight(insight, directory),
    severity: insight.severity,
  }));
}
