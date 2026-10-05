import type { Anomaly } from '../../finance/domain/anomaly/anomaly-detector.js';
import type { Insight } from '../../finance/domain/insights/insight-engine.js';
import type { NameDirectory } from './result-description.js';
import { allSpendingLabel, describeAnomalies, describeInsights } from './signal-descriptions.js';

function directory(locale?: NameDirectory['locale']): NameDirectory {
  return {
    members: new Map([['member-a', 'Beatriz']]),
    categories: new Map([['groceries', locale === 'pt-BR' ? 'Mercado' : 'Groceries']]),
    accounts: new Map(),
    goals: new Map([['goal-trip', 'Viagem']]),
    ...(locale === undefined ? {} : { locale }),
  };
}

const EXCEEDED = {
  type: 'BUDGET_EXCEEDED',
  severity: 'HIGH',
  key: 'BUDGET_EXCEEDED:budget:2026-10-01',
  evidence: {
    budgetId: 'budget',
    categoryId: 'groceries',
    currency: 'EUR',
    period: { start: '2026-10-01', end: '2026-10-31' },
    limitMinor: 15000,
    spentMinor: 18000,
    remainingMinor: -3000,
    usageBasisPoints: 12000,
    status: 'EXCEEDED',
    alertThresholdPercent: 80,
  },
} as unknown as Insight;

const LARGE: Anomaly = {
  type: 'UNUSUALLY_LARGE_TRANSACTION',
  transactionId: 'transaction',
  categoryId: 'groceries',
  currency: 'EUR',
  date: '2026-10-14',
  merchant: 'Tesco',
  amountMinor: 24050,
  baselineAmountMinor: 3200,
} as unknown as Anomaly;

describe('signal descriptions', () => {
  it('describes a signal in English when the household has no language set', () => {
    expect(describeInsights([EXCEEDED], directory())[0]).toMatchObject({
      title: 'Groceries budget exceeded',
      detail: '€180.00 of €150.00 spent (120%).',
    });
  });

  it('describes a signal in Brazilian Portuguese, with Portuguese amounts', () => {
    const [described] = describeInsights([EXCEEDED], directory('pt-BR'));

    expect(described?.title).toBe('Orçamento de Mercado ultrapassado');
    expect(described?.detail.replace(/\s/g, ' ')).toBe('€ 180,00 gastos de € 150,00 (120%).');
  });

  it('describes an anomaly in Brazilian Portuguese', () => {
    const [described] = describeAnomalies([LARGE], directory('pt-BR'));

    expect(described?.title).toBe('Gasto atípico em Mercado');
    expect(described?.detail.replace(/\s/g, ' ')).toBe(
      '€ 240,50 em Tesco, quando o habitual é € 32,00.',
    );
  });

  it('names the whole-household budget in each language', () => {
    expect(allSpendingLabel('en')).toBe('All spending');
    expect(allSpendingLabel('pt-BR')).toBe('Gastos totais');
  });
});
