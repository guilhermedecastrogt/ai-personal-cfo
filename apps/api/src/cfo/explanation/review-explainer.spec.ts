import { Logger } from '@nestjs/common';
import { FakeAIProvider } from '../../ai/testing/fake-ai-provider.fixture.js';
import { formatNarrative } from './narrative-format.js';
import { ReviewExplainer } from './review-explainer.js';

const REVIEW = {
  currency: 'EUR',
  month: { start: '2026-10-01', end: '2026-10-31' },
  dataThrough: '2026-10-20',
  monthIsComplete: false,
  transactionsRecorded: 12,
  comparisonAvailable: true,
  totals: {
    income: '€4,500.00',
    expenses: '€2,900.00',
    netCashFlow: '€1,600.00',
    savingsRate: '35.56%',
  },
  findings: [
    { kind: 'STRENGTH', code: 'POSITIVE_CASH_FLOW', net: '€1,600.00' },
    { kind: 'STRENGTH', code: 'HEALTHY_SAVINGS_RATE', savingsRate: '35.56%' },
    {
      kind: 'CONCERN',
      code: 'BUDGET_EXCEEDED',
      category: 'Restaurants',
      limit: '€300.00',
      spent: '€420.00',
      usage: '140%',
    },
    { kind: 'CONCERN', code: 'GOAL_OVERDUE', goal: 'Summer Trip', remaining: '€380.00' },
  ],
};

const REQUEST = {
  userMessage: 'Como estamos este mês?',
  senderName: 'Member A',
  reviews: [REVIEW],
};

const GROUNDED = {
  summary: 'Este mês entraram €4,500.00 e saíram €2,900.00, ficando €1,600.00.',
  strengths: ['A taxa de poupança está em 35.56%.'],
  concerns: ['O orçamento de Restaurants foi ultrapassado: €420.00 de €300.00 (140%).'],
  recommendations: ['Reduzir os gastos em Restaurants até ao fim do mês.'],
  priorities: ['Rever o orçamento de Restaurants.'],
};

async function explain(output: unknown): Promise<Awaited<ReturnType<ReviewExplainer['explain']>>> {
  return new ReviewExplainer(new FakeAIProvider().willExplainReviewAs(output)).explain(REQUEST);
}

describe('ReviewExplainer', () => {
  beforeAll(() => {
    Logger.overrideLogger(false);
  });

  it('returns a narrative whose every figure comes from the review', async () => {
    expect(await explain(GROUNDED)).toEqual({ narrative: GROUNDED, source: 'AI' });
  });

  it('gives the provider the review context and nothing else', async () => {
    const provider = new FakeAIProvider().willExplainReviewAs(GROUNDED);

    await new ReviewExplainer(provider).explain(REQUEST);

    expect(provider.reviewRequests).toEqual([REQUEST]);
  });

  it.each([
    ['an invented total', { ...GROUNDED, summary: 'Gastaram €3,100.00 este mês.' }],
    [
      'a difference it calculated itself',
      { ...GROUNDED, concerns: ['Restaurants passou €120.00 do limite.'] },
    ],
    ['a made-up percentage', { ...GROUNDED, strengths: ['Pouparam 40% do rendimento.'] }],
    ['a target it invented', { ...GROUNDED, recommendations: ['Limitem Restaurants a €250.00.'] }],
    ['a count that is not in the review', { ...GROUNDED, priorities: ['Cancelar 2 subscrições.'] }],
  ])('replaces a narrative containing %s', async (_description, output) => {
    const explained = await explain(output);

    expect(explained.source).toBe('DETERMINISTIC');
    expect(formatNarrative(explained.narrative)).not.toMatch(
      /3,100|€120\.00|\b40%|€250\.00|2 subscri/,
    );
  });

  it.each([
    ['prose', 'You are doing great this month!'],
    ['a missing section', { summary: 'ok', strengths: [], concerns: [], recommendations: [] }],
    ['a section of the wrong type', { ...GROUNDED, concerns: 'none' }],
    ['an empty summary', { ...GROUNDED, summary: '   ' }],
    [
      'too many points',
      { ...GROUNDED, concerns: Array.from({ length: 6 }, () => 'Atenção aos Restaurants.') },
    ],
    ['an overlong point', { ...GROUNDED, strengths: ['a'.repeat(401)] }],
    ['an overlong summary', { ...GROUNDED, summary: 'a'.repeat(901) }],
  ])('replaces %s', async (_description, output) => {
    expect((await explain(output)).source).toBe('DETERMINISTIC');
  });

  it('drops blank points and trims the rest', async () => {
    const explained = await explain({
      ...GROUNDED,
      strengths: ['  A taxa de poupança está em 35.56%.  ', ' '],
    });

    expect(explained.narrative.strengths).toEqual(['A taxa de poupança está em 35.56%.']);
  });

  it.each([
    'TIMEOUT',
    'RATE_LIMITED',
    'UNAVAILABLE',
    'AUTHENTICATION',
    'INVALID_RESPONSE',
  ] as const)(
    'falls back to the deterministic narrative when the provider fails with %s',
    async (failure) => {
      const provider = new FakeAIProvider().willFailToExplainReview(failure);

      const explained = await new ReviewExplainer(provider).explain(REQUEST);

      expect(explained).toEqual({
        source: 'DETERMINISTIC',
        narrative: {
          summary:
            'For 2026-10-01 to 2026-10-31, income was €4,500.00 and spending was €2,900.00, leaving €1,600.00. The savings rate is 35.56%. These figures run through 2026-10-20.',
          strengths: ['Income exceeded spending by €1,600.00.', 'The savings rate is 35.56%.'],
          concerns: [
            'The Restaurants budget of €300.00 is exceeded, with €420.00 spent (140%).',
            'The goal Summer Trip is past its date with €380.00 still to save.',
          ],
          recommendations: [
            'Hold back on Restaurants for the rest of the period, or adjust the budget.',
            'Set a new date or amount for the goal Summer Trip.',
          ],
          priorities: [
            'Hold back on Restaurants for the rest of the period, or adjust the budget.',
            'Set a new date or amount for the goal Summer Trip.',
          ],
        },
      });
    },
  );

  it('describes an empty month without inventing anything', async () => {
    const empty = { ...REVIEW, transactionsRecorded: 0, findings: [] };
    const provider = new FakeAIProvider().willFailToExplainReview('UNAVAILABLE');

    const explained = await new ReviewExplainer(provider).explain({ ...REQUEST, reviews: [empty] });

    expect(explained.narrative).toEqual({
      summary: 'No transactions are recorded in EUR for 2026-10-01 to 2026-10-31.',
      strengths: [],
      concerns: [],
      recommendations: [],
      priorities: [],
    });
  });

  it('keeps reviews in different currencies apart in the fallback', async () => {
    const reais = {
      ...REVIEW,
      currency: 'BRL',
      totals: {
        income: 'R$1,000.00',
        expenses: 'R$400.00',
        netCashFlow: 'R$600.00',
        savingsRate: '60%',
      },
      findings: [],
    };
    const provider = new FakeAIProvider().willFailToExplainReview('UNAVAILABLE');

    const explained = await new ReviewExplainer(provider).explain({
      ...REQUEST,
      reviews: [REVIEW, reais],
    });

    expect(explained.narrative.summary).toContain('income was €4,500.00');
    expect(explained.narrative.summary).toContain('income was R$1,000.00');
    expect(explained.narrative.summary).not.toMatch(/5,500|5500/);
  });
});

describe('formatNarrative', () => {
  it('lays the narrative out as one message with marked points', () => {
    expect(formatNarrative(GROUNDED)).toBe(
      [
        'Este mês entraram €4,500.00 e saíram €2,900.00, ficando €1,600.00.',
        '✓ A taxa de poupança está em 35.56%.',
        '! O orçamento de Restaurants foi ultrapassado: €420.00 de €300.00 (140%).',
        '→ Reduzir os gastos em Restaurants até ao fim do mês.',
        '1. Rever o orçamento de Restaurants.',
      ].join('\n\n'),
    );
  });

  it('omits empty sections', () => {
    expect(
      formatNarrative({
        summary: 'Sem movimentos.',
        strengths: [],
        concerns: [],
        recommendations: [],
        priorities: [],
      }),
    ).toBe('Sem movimentos.');
  });
});
