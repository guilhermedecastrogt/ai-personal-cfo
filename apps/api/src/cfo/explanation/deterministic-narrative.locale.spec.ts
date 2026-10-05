import { describeFindings, renderDeterministicNarrative } from './deterministic-narrative.js';

const REVIEW = {
  currency: 'EUR',
  month: { start: '2026-10-01', end: '2026-10-31' },
  dataThrough: '2026-10-20',
  monthIsComplete: false,
  transactionsRecorded: 12,
  comparisonAvailable: false,
  totals: {
    income: '€ 3.000,00',
    expenses: '€ 2.220,00',
    netCashFlow: '€ 780,00',
    savingsRate: '26%',
  },
  findings: [
    { kind: 'STRENGTH', code: 'POSITIVE_CASH_FLOW', net: '€ 780,00' },
    {
      kind: 'CONCERN',
      code: 'BUDGET_EXCEEDED',
      category: 'Restaurantes',
      limit: '€ 150,00',
      spent: '€ 180,00',
      usage: '120%',
    },
  ],
};

describe('deterministic narrative in Brazilian Portuguese', () => {
  it('writes the summary, strengths, concerns and suggestions in Portuguese', () => {
    const narrative = renderDeterministicNarrative([REVIEW], 'pt-BR');

    expect(narrative.summary).toBe(
      'Entre 2026-10-01 e 2026-10-31, as receitas foram € 3.000,00 e os gastos € 2.220,00, um saldo de € 780,00. A taxa de poupança está em 26%. Os números vão até 2026-10-20. Ainda não há um período anterior para comparar.',
    );
    expect(narrative.strengths).toEqual(['As receitas superaram os gastos em € 780,00.']);
    expect(narrative.concerns).toEqual([
      'O orçamento de Restaurantes, de € 150,00, foi ultrapassado, com € 180,00 gastos (120%).',
    ]);
    expect(narrative.recommendations).toEqual([
      'Segure os gastos com Restaurantes até o fim do período, ou ajuste o orçamento.',
    ]);
  });

  it('keeps English as the default', () => {
    expect(renderDeterministicNarrative([REVIEW]).strengths).toEqual([
      'Income exceeded spending by € 780,00.',
    ]);
    expect(describeFindings(REVIEW).map((finding) => finding.code)).toEqual([
      'POSITIVE_CASH_FLOW',
      'BUDGET_EXCEEDED',
    ]);
  });

  it('describes each finding in Portuguese for the dashboard', () => {
    expect(describeFindings(REVIEW, 'pt-BR')[0]).toEqual({
      kind: 'STRENGTH',
      code: 'POSITIVE_CASH_FLOW',
      statement: 'As receitas superaram os gastos em € 780,00.',
    });
  });
});
