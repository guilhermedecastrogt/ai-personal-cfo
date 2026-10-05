import { Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  questionInterpretation,
  UNSPECIFIED_PERIOD,
} from '../src/ai/testing/fake-ai-provider.fixture.js';
import { categories } from '../src/categories/categories.schema.js';
import { FutureMonthError, type MonthlyReviewResult } from '../src/cfo/cfo.service.js';
import { formatNarrative } from '../src/cfo/explanation/narrative-format.js';
import { calendarMonth } from '../src/finance/domain/period/period.js';
import type { RequestContext } from '../src/households/request-context.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { createAssistantHarness, type AssistantHarness } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const TODAY = '2026-10-20';
const INSTANT = new Date('2026-10-20T12:00:00Z');
const OCTOBER = calendarMonth(2026, 10);
const SEPTEMBER = calendarMonth(2026, 9);
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

type NewRow = Partial<typeof transactions.$inferInsert> & { readonly amountMinor: number };

describe('CFO monthly review', () => {
  let testDatabase: TestDatabase;
  let harness: AssistantHarness;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    return categoryIds.get(name) ?? '';
  }

  function contextOf(fixture: HouseholdFixture, memberPosition = 0): RequestContext {
    const member = memberAt(fixture, memberPosition);
    return {
      householdId: fixture.household.id,
      memberId: member.id,
      memberName: member.name,
      channel: 'whatsapp',
    };
  }

  async function record(
    fixture: HouseholdFixture,
    memberPosition: number,
    rows: readonly NewRow[],
  ): Promise<void> {
    await testDatabase.database.insert(transactions).values(
      rows.map((row) => ({
        householdId: fixture.household.id,
        memberId: memberAt(fixture, memberPosition).id,
        accountId: fixture.jointAccount.id,
        type: 'EXPENSE' as const,
        currency: 'EUR',
        transactionDate: '2026-10-10',
        source: 'MANUAL' as const,
        ...row,
      })),
    );
  }

  async function review(
    fixture: HouseholdFixture,
    month = OCTOBER,
    memberPosition = 0,
  ): Promise<MonthlyReviewResult> {
    return harness.cfo.monthlyReview(contextOf(fixture, memberPosition), { month, today: TODAY });
  }

  async function establishedHousehold(
    name: string,
    memberCount: number,
  ): Promise<HouseholdFixture> {
    const fixture = await createHouseholdFixture(testDatabase.database, name, memberCount);
    for (const month of ['07', '08', '09']) {
      await record(fixture, 0, [
        {
          amountMinor: 300000,
          type: 'INCOME',
          categoryId: category('Salary'),
          transactionDate: `2026-${month}-01`,
        },
        {
          amountMinor: 180000,
          categoryId: category('Rent'),
          merchant: 'Landlord',
          transactionDate: `2026-${month}-01`,
        },
        {
          amountMinor: 1799,
          categoryId: category('Subscriptions'),
          merchant: 'Streaming',
          transactionDate: `2026-${month}-03`,
        },
        {
          amountMinor: 3000,
          categoryId: category('Restaurants'),
          transactionDate: `2026-${month}-06`,
        },
        {
          amountMinor: 3500,
          categoryId: category('Restaurants'),
          transactionDate: `2026-${month}-14`,
        },
        {
          amountMinor: 25000,
          categoryId: category('Groceries'),
          transactionDate: `2026-${month}-25`,
        },
      ]);
    }
    await record(fixture, 0, [
      {
        amountMinor: 300000,
        type: 'INCOME',
        categoryId: category('Salary'),
        transactionDate: '2026-10-01',
      },
      {
        amountMinor: 180000,
        categoryId: category('Rent'),
        merchant: 'Landlord',
        transactionDate: '2026-10-01',
      },
      {
        amountMinor: 1799,
        categoryId: category('Subscriptions'),
        merchant: 'Streaming',
        transactionDate: '2026-10-03',
      },
      { amountMinor: 3200, categoryId: category('Restaurants'), transactionDate: '2026-10-06' },
    ]);
    await record(fixture, memberCount - 1, [
      {
        amountMinor: 24000,
        categoryId: category('Restaurants'),
        merchant: 'Tasting Menu',
        transactionDate: '2026-10-14',
      },
    ]);
    await harness.budgets.create(fixture.household.id, {
      categoryId: category('Restaurants'),
      period: 'MONTHLY',
      limitMinor: 20000,
      currency: 'EUR',
      startsOn: '2026-01-01',
    });
    await harness.goals.create(fixture.household.id, {
      name: 'Summer Trip',
      type: 'TRAVEL',
      targetAmountMinor: 100000,
      currentAmountMinor: 62000,
      currency: 'EUR',
      targetDate: '2027-06-30',
    });
    return fixture;
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    harness = await createAssistantHarness(testDatabase.database);
    for (const row of await testDatabase.database.select().from(categories)) {
      categoryIds.set(row.name, row.id);
    }
  });

  beforeEach(() => {
    harness.provider.reviewRequests.length = 0;
    harness.provider.replyRequests.length = 0;
    harness.provider.interpretationRequests.length = 0;
    harness.provider.willFailToExplainReview('UNAVAILABLE');
  });

  afterAll(async () => {
    await harness.dispose();
    await testDatabase.destroy();
  });

  describe('a household with history', () => {
    let fixture: HouseholdFixture;
    let result: MonthlyReviewResult;

    beforeAll(async () => {
      fixture = await establishedHousehold('Established', 3);
      result = await review(fixture);
    });

    it('reports the month to date with the totals of the finance engine', async () => {
      const [october] = result.reviews;
      const engine = await harness.finance.cashFlow(fixture.household.id, {
        start: OCTOBER.start,
        end: TODAY,
      });

      expect(result.reviews).toHaveLength(1);
      expect(october).toMatchObject({
        currency: 'EUR',
        month: OCTOBER,
        asOf: TODAY,
        isComplete: false,
        totals: {
          incomeMinor: engine.cashFlow.incomeMinor,
          expensesMinor: engine.cashFlow.expensesMinor,
          netMinor: engine.cashFlow.netMinor,
          savingsRateBasisPoints: engine.savings.savingsRateBasisPoints,
        },
      });
      expect(october?.totals).toEqual({
        incomeMinor: 300000,
        expensesMinor: 208999,
        netMinor: 91001,
        savingsRateBasisPoints: 3033,
      });
    });

    it('compares with the same days of the previous month', () => {
      expect(result.reviews[0]?.comparison).toMatchObject({
        previousPeriod: { start: '2026-09-01', end: '2026-09-20' },
        expenses: {
          currentMinor: 208999,
          previousMinor: 188299,
          differenceMinor: 20700,
          changeBasisPoints: 1099,
        },
        income: { currentMinor: 300000, previousMinor: 300000, direction: 'UNCHANGED' },
        previousSavingsRateBasisPoints: 3723,
      });
    });

    it('shows which categories changed', () => {
      const increases = result.reviews[0]?.categoryIncreases.map((trend) => [
        trend.categoryId,
        trend.differenceMinor,
      ]);

      expect(increases).toHaveLength(2);
      expect(increases).toEqual(
        expect.arrayContaining([
          [category('Food'), 20700],
          [category('Restaurants'), 20700],
        ]),
      );
    });

    it('includes budget status, the forecast, recurring expenses, anomalies and goals', () => {
      const [october] = result.reviews;

      expect(october?.budgets).toEqual([
        expect.objectContaining({
          categoryId: category('Restaurants'),
          limitMinor: 20000,
          spentMinor: 27200,
          usageBasisPoints: 13600,
          status: 'EXCEEDED',
        }),
      ]);
      expect(october?.forecast).toMatchObject({
        spentMinor: 208999,
        projectedTotalMinor: 233999,
        daysRemaining: 11,
        method: 'HISTORICAL_REMAINDER',
      });
      expect(october?.recurring).toMatchObject({
        monthlyEquivalentMinor: 181799,
        commitments: [
          { merchant: 'Landlord', monthlyEquivalentMinor: 180000 },
          { merchant: 'Streaming', monthlyEquivalentMinor: 1799 },
        ],
      });
      expect(october?.anomalies.map((anomaly) => anomaly.type)).toEqual([
        'UNUSUALLY_LARGE_TRANSACTION',
        'UNUSUAL_CATEGORY_SPENDING',
      ]);
      expect(october?.goals).toEqual([
        expect.objectContaining({
          remainingMinor: 38000,
          progressBasisPoints: 6200,
          state: 'IN_PROGRESS',
        }),
      ]);
      expect(october?.balances).toMatchObject({ currency: 'EUR' });
    });

    it('derives findings from those results', () => {
      expect(result.reviews[0]?.findings.map((finding) => finding.code)).toEqual([
        'POSITIVE_CASH_FLOW',
        'HEALTHY_SAVINGS_RATE',
        'BUDGET_EXCEEDED',
        'CATEGORY_SPENDING_INCREASED',
        'CATEGORY_SPENDING_INCREASED',
        'UNUSUAL_SPENDING',
        'UNUSUAL_SPENDING',
      ]);
    });

    it('attributes spending to each of the three members', () => {
      expect(result.reviews[0]?.byMember).toEqual([
        expect.objectContaining({
          memberId: memberAt(fixture, 0).id,
          spentMinor: 184999,
          incomeMinor: 300000,
        }),
        expect.objectContaining({
          memberId: memberAt(fixture, 2).id,
          spentMinor: 24000,
          incomeMinor: 0,
        }),
        expect.objectContaining({
          memberId: memberAt(fixture, 1).id,
          spentMinor: 0,
          incomeMinor: 0,
        }),
      ]);
    });

    it('reviews the previous month as a completed month', async () => {
      const previous = await review(fixture, SEPTEMBER);

      expect(previous.reviews[0]).toMatchObject({
        month: SEPTEMBER,
        asOf: '2026-09-30',
        isComplete: true,
        totals: { incomeMinor: 300000, expensesMinor: 213299, netMinor: 86701 },
        forecast: null,
        balances: null,
      });
      expect(previous.reviews[0]?.comparison?.previousPeriod).toEqual(calendarMonth(2026, 8));
    });

    it('reviews an explicitly requested earlier month', async () => {
      const july = await review(fixture, calendarMonth(2026, 7));

      expect(july.reviews[0]).toMatchObject({
        month: calendarMonth(2026, 7),
        isComplete: true,
        totals: { expensesMinor: 213299 },
        comparison: null,
      });
    });

    it('refuses a month that has not started', async () => {
      await expect(review(fixture, calendarMonth(2026, 11))).rejects.toThrow(FutureMonthError);
    });

    it('changes no financial data', async () => {
      const before = await testDatabase.database.$count(transactions);

      await review(fixture);

      expect(await testDatabase.database.$count(transactions)).toBe(before);
    });
  });

  describe('little or no data', () => {
    it('reviews an empty month without findings, comparisons or invented values', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Empty Review', 2);

      const result = await review(fixture);

      expect(result.reviews).toHaveLength(1);
      expect(result.reviews[0]).toMatchObject({
        transactionCount: 0,
        totals: { incomeMinor: 0, expensesMinor: 0, netMinor: 0, savingsRateBasisPoints: null },
        comparison: null,
        budgets: [],
        goals: [],
        anomalies: [],
        findings: [],
      });
      expect(result.narrative).toEqual({
        summary: 'No transactions are recorded in EUR for 2026-10-01 to 2026-10-31.',
        strengths: [],
        concerns: [],
        recommendations: [],
        priorities: [],
      });
    });

    it('makes no comparison for a household in its first month', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'First Month', 1);
      await record(fixture, 0, [
        { amountMinor: 200000, type: 'INCOME' },
        { amountMinor: 50000, categoryId: category('Groceries') },
      ]);

      const result = await review(fixture);

      expect(result.reviews[0]).toMatchObject({
        comparison: null,
        categoryIncreases: [],
        categoryDecreases: [],
        forecast: { method: 'LINEAR_PACE' },
      });
      expect(result.narrative.summary).toContain('There is no earlier period to compare with yet.');
    });
  });

  describe('household size', () => {
    it.each([1, 2, 5])('reviews a household of %d members', async (memberCount) => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        `Review Size ${String(memberCount)}`,
        memberCount,
      );
      for (let position = 0; position < memberCount; position += 1) {
        await record(fixture, position, [{ amountMinor: 1000 * (position + 1) }]);
      }

      const result = await review(fixture);

      expect(result.reviews[0]?.byMember).toHaveLength(memberCount);
      expect(
        result.reviews[0]?.byMember.map((member) => member.spentMinor).sort((a, b) => a - b),
      ).toEqual(Array.from({ length: memberCount }, (_, position) => 1000 * (position + 1)));
    });

    it('sends no member breakdown to the model for a household of one', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Solo Context', 1);
      await record(fixture, 0, [{ amountMinor: 1000 }]);

      await review(fixture);

      expect(harness.provider.reviewRequests[0]?.reviews[0]?.spendingByMember).toEqual([]);
    });
  });

  describe('currencies', () => {
    it('gives each currency its own review and never a combined total', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Two Currency Review', 1);
      const reais = await harness.accounts.create(fixture.household.id, {
        name: 'Reais',
        type: 'BANK',
        currency: 'BRL',
      });
      await record(fixture, 0, [
        { amountMinor: 400000, type: 'INCOME' },
        { amountMinor: 100000 },
        { amountMinor: 50000, accountId: reais.id, currency: 'BRL' },
      ]);

      const result = await review(fixture);

      expect(
        result.reviews.map((monthly) => [monthly.currency, monthly.totals.expensesMinor]),
      ).toEqual([
        ['EUR', 100000],
        ['BRL', 50000],
      ]);
      expect(JSON.stringify(result)).not.toContain('150000');
      expect(result.narrative.summary).toContain('€1,000.00');
      expect(result.narrative.summary).toContain('R$500.00');
    });

    it('leaves out a currency in which nothing happened', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Idle Currency', 1);
      await harness.accounts.create(fixture.household.id, {
        name: 'Dollars',
        type: 'BANK',
        currency: 'USD',
      });
      await record(fixture, 0, [{ amountMinor: 1000 }]);

      expect((await review(fixture)).reviews.map((monthly) => monthly.currency)).toEqual(['EUR']);
    });
  });

  describe('household isolation', () => {
    it('reviews only the household of the requesting member', async () => {
      const own = await createHouseholdFixture(testDatabase.database, 'Review Own', 2);
      const other = await establishedHousehold('Review Other', 2);
      await record(own, 0, [{ amountMinor: 4200, categoryId: category('Groceries') }]);
      harness.provider.willExplainReviewAs({
        summary: 'Resumo.',
        strengths: [],
        concerns: [],
        recommendations: [],
        priorities: [],
      });

      const result = await review(own);
      const sent = JSON.stringify(harness.provider.reviewRequests);

      expect(result.reviews[0]?.totals).toMatchObject({ expensesMinor: 4200, incomeMinor: 0 });
      expect(result.reviews[0]?.budgets).toEqual([]);
      expect(result.reviews[0]?.goals).toEqual([]);
      expect(result.reviews[0]?.recurring.commitments).toEqual([]);
      expect(result.reviews[0]?.byMember.map((member) => member.memberId).sort()).toEqual(
        own.members.map((member) => member.id).sort(),
      );
      expect(sent).not.toContain('Landlord');
      expect(sent).not.toContain('Summer Trip');
      expect(sent).not.toContain(memberAt(other, 0).name);
    });
  });

  describe('explanation', () => {
    const grounded = {
      summary: 'Até 2026-10-20 entraram €3,000.00 e saíram €2,089.99.',
      strengths: ['A taxa de poupança está em 30.33%.'],
      concerns: ['O orçamento de Restaurants foi ultrapassado: €272.00 de €200.00 (136%).'],
      recommendations: ['Travar os gastos em Restaurants até ao fim do mês.'],
      priorities: ['Rever os gastos em Restaurants.'],
    };
    let fixture: HouseholdFixture;

    beforeAll(async () => {
      fixture = await establishedHousehold('Explained', 2);
    });

    it('uses the narrative of the model when every figure in it comes from the review', async () => {
      harness.provider.willExplainReviewAs(grounded);

      const result = await review(fixture);

      expect(result.narrativeSource).toBe('AI');
      expect(result.narrative).toEqual(grounded);
    });

    it('sends the model a compact context without identifiers or unneeded personal data', async () => {
      harness.provider.willExplainReviewAs(grounded);
      await harness.households.registerWhatsAppIdentity(fixture.household.id, {
        memberId: memberAt(fixture, 0).id,
        provider: 'kapso',
        externalUserId: '353851112222',
        phoneNumber: '+353851112222',
      });

      await review(fixture);
      const [request] = harness.provider.reviewRequests;
      const sent = JSON.stringify(request);

      expect(Object.keys(request ?? {}).sort()).toEqual([
        'locale',
        'reviews',
        'senderName',
        'userMessage',
      ]);
      expect(request?.locale).toBe('en');
      expect(sent).not.toMatch(UUID);
      expect(sent).not.toMatch(/Id"|Minor"|BasisPoints"/);
      expect(sent).not.toContain('353851112222');
      expect(sent).not.toContain('Joint Account');
      expect(sent.length).toBeLessThan(6000);
      expect(request?.reviews[0]).toMatchObject({
        totals: {
          income: '€3,000.00',
          expenses: '€2,089.99',
          netCashFlow: '€910.01',
          savingsRate: '30.33%',
        },
        budgets: [{ category: 'Restaurants', spent: '€272.00', limit: '€200.00', usage: '136%' }],
        recurring: { monthlyEquivalent: '€1,817.99' },
      });
    });

    it.each([
      ['an invented amount', { ...grounded, summary: 'Gastaram €2,500.00 este mês.' }],
      [
        'a calculated difference',
        { ...grounded, concerns: ['Gastam em média €61.37 por semana em Restaurants.'] },
      ],
      [
        'a suggested figure of its own',
        { ...grounded, recommendations: ['Limitem Restaurants a €150.00.'] },
      ],
    ])(
      'replaces a narrative containing %s with the deterministic one',
      async (_description, narrative) => {
        harness.provider.willExplainReviewAs(narrative);

        const result = await review(fixture);
        const text = formatNarrative(result.narrative);

        expect(result.narrativeSource).toBe('DETERMINISTIC');
        expect(text).not.toMatch(/2,500\.00|€61\.37|€150\.00/);
        expect(text).toContain(
          'The Restaurants budget of €200.00 is exceeded, with €272.00 spent (136%).',
        );
      },
    );

    it.each(['TIMEOUT', 'RATE_LIMITED', 'UNAVAILABLE', 'AUTHENTICATION'] as const)(
      'produces the same review deterministically when the provider fails with %s',
      async (failure) => {
        harness.provider.willFailToExplainReview(failure);

        const result = await review(fixture);

        expect(result.narrativeSource).toBe('DETERMINISTIC');
        expect(result.reviews[0]?.totals.expensesMinor).toBe(208999);
        expect(result.narrative.summary).toBe(
          'For 2026-10-01 to 2026-10-31, income was €3,000.00 and spending was €2,089.99, leaving €910.01. The savings rate is 30.33%. These figures run through 2026-10-20.',
        );
        expect(result.narrative.concerns).toContain(
          'The Restaurants budget of €200.00 is exceeded, with €272.00 spent (136%).',
        );
        expect(result.narrative.priorities.length).toBeGreaterThan(0);
      },
    );
  });

  describe('through the assistant', () => {
    let fixture: HouseholdFixture;

    beforeAll(async () => {
      fixture = await establishedHousehold('Assistant Review', 2);
    });

    it('answers a request for a review with the formatted narrative', async () => {
      harness.provider.willInterpretAs(questionInterpretation({ intent: 'MONTHLY_REVIEW' }));

      const response = await harness.assistant.handle(
        contextOf(fixture),
        { text: 'Como estamos este mês?' },
        INSTANT,
      );

      expect(response.outcome).toMatchObject({
        kind: 'REVIEW',
        review: { month: OCTOBER, narrativeSource: 'DETERMINISTIC' },
      });
      expect(response.reply).toContain('income was €3,000.00 and spending was €2,089.99');
      expect(response.reply).toContain('! The Restaurants budget of €200.00 is exceeded');
      expect(harness.provider.replyRequests).toEqual([]);
      expect(harness.provider.reviewRequests[0]?.userMessage).toBe('Como estamos este mês?');
    });

    it('reviews the previous month when asked', async () => {
      harness.provider.willInterpretAs(
        questionInterpretation({
          intent: 'MONTHLY_REVIEW',
          period: { ...UNSPECIFIED_PERIOD, kind: 'PREVIOUS_MONTH' },
        }),
      );

      const response = await harness.assistant.handle(
        contextOf(fixture),
        { text: 'E o mês passado?' },
        INSTANT,
      );

      expect(response.outcome).toMatchObject({ kind: 'REVIEW', review: { month: SEPTEMBER } });
    });

    it('asks instead of reviewing a month that has not started', async () => {
      harness.provider.willInterpretAs(
        questionInterpretation({
          intent: 'MONTHLY_REVIEW',
          period: { kind: 'SPECIFIC_MONTH', days: null, year: 2027, month: 3 },
        }),
      );

      const response = await harness.assistant.handle(
        contextOf(fixture),
        { text: 'Março de 2027?' },
        INSTANT,
      );

      expect(response.outcome).toMatchObject({
        kind: 'QUESTION',
        query: { status: 'NEEDS_CLARIFICATION', reasons: ['UNRESOLVABLE_PERIOD'] },
      });
      expect(harness.provider.reviewRequests).toEqual([]);
    });

    it('still answers ordinary questions through the query service', async () => {
      harness.provider.willInterpretAs(questionInterpretation({ intent: 'SPENDING_TOTAL' }));

      const response = await harness.assistant.handle(
        contextOf(fixture),
        { text: 'Quanto gastamos?' },
        INSTANT,
      );

      expect(response.outcome).toMatchObject({ kind: 'QUESTION', query: { status: 'ANSWERED' } });
      expect(harness.provider.reviewRequests).toEqual([]);
    });

    it('reviews the household of the sender whoever asks', async () => {
      const other = await createHouseholdFixture(testDatabase.database, 'Assistant Other', 1);
      await record(other, 0, [{ amountMinor: 777 }]);
      harness.provider.willInterpretAs(questionInterpretation({ intent: 'MONTHLY_REVIEW' }));

      const response = await harness.assistant.handle(
        contextOf(other),
        { text: 'Resumo do mês' },
        INSTANT,
      );

      expect(response.reply).toContain('spending was €7.77');
      expect(response.reply).not.toContain('2,089.99');
      expect(
        await testDatabase.database.$count(
          transactions,
          eq(transactions.householdId, other.household.id),
        ),
      ).toBe(1);
    });
  });
});
