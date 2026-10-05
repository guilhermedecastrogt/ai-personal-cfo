import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { z } from 'zod';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { FakeAIProvider } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { dashboardSessions } from '../src/auth/auth.schema.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { categories } from '../src/categories/categories.schema.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import {
  accountsSchema,
  budgetsSchema,
  goalsSchema,
  incomeSchema,
  outlookViewSchema,
  overviewSchema,
  notificationsSchema,
  recurringSchema,
  reviewSchema,
  sessionSchema,
  signalsSchema,
  spendingSchema,
  transactionsSchema,
} from '../src/dashboard/dashboard.contracts.js';
import { FinanceService } from '../src/finance/application/finance.service.js';
import {
  addDays,
  monthContaining,
  previousPeriod,
  type DateRange,
} from '../src/finance/domain/period/period.js';
import { GoalsRepository } from '../src/goals/goals.repository.js';
import { ProactiveCfoService } from '../src/proactive/proactive-cfo.service.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { SECURITY_POLICY_TOKEN } from '../src/security/security-policy.js';
import { RELAXED_SECURITY_POLICY, TEST_CONFIG } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;
const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = monthContaining(TODAY);
const LAST_MONTH = previousPeriod('MONTHLY', THIS_MONTH);
const TWO_MONTHS_AGO = previousPeriod('MONTHLY', LAST_MONTH);

type NewRow = Partial<typeof transactions.$inferInsert> & { readonly amountMinor: number };

function keyOf(month: DateRange): string {
  return month.start.slice(0, 7);
}

describe('dashboard API', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let ai: FakeAIProvider;
  let auth: AuthService;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    return categoryIds.get(name) ?? '';
  }

  async function tokenFor(fixture: HouseholdFixture, memberPosition = 0): Promise<string> {
    const code = await auth.issueAccessCode(
      fixture.household.id,
      memberAt(fixture, memberPosition).id,
    );
    const response = await request(app.getHttpServer())
      .post('/auth/sessions')
      .send({ accessCode: code });
    return (response.body as { token: string }).token;
  }

  async function get(path: string, token?: string): Promise<{ status: number; body: unknown }> {
    const call = request(app.getHttpServer()).get(path);
    const response = await (token === undefined
      ? call
      : call.set('Authorization', `Bearer ${token}`));
    return { status: response.status, body: response.body as unknown };
  }

  async function view<Schema extends z.ZodType>(
    schema: Schema,
    path: string,
    token: string,
  ): Promise<z.output<Schema>> {
    const response = await get(path, token);
    expect(response.status).toBe(200);
    expect(schema.parse(response.body)).toEqual(response.body);
    return response.body as z.output<Schema>;
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
        transactionDate: THIS_MONTH.start,
        source: 'MANUAL' as const,
        ...row,
      })),
    );
  }

  async function establishedHousehold(name: string, memberCount = 3): Promise<HouseholdFixture> {
    const fixture = await createHouseholdFixture(testDatabase.database, name, memberCount);
    for (const month of [TWO_MONTHS_AGO, LAST_MONTH, THIS_MONTH]) {
      await record(fixture, 0, [
        {
          amountMinor: 300000,
          type: 'INCOME',
          categoryId: category('Salary'),
          transactionDate: month.start,
        },
        {
          amountMinor: 180000,
          categoryId: category('Rent'),
          merchant: 'Landlord',
          transactionDate: month.start,
        },
        {
          amountMinor: 24000,
          categoryId: category('Groceries'),
          merchant: 'Lidl',
          transactionDate: month.start,
        },
      ]);
    }
    await record(fixture, memberCount - 1, [
      { amountMinor: 18000, categoryId: category('Restaurants'), merchant: 'Bistro' },
      {
        amountMinor: 9000,
        categoryId: category('Restaurants'),
        merchant: 'Bistro',
        transactionDate: LAST_MONTH.start,
      },
    ]);
    await app.get(BudgetsRepository).create(fixture.household.id, {
      categoryId: category('Restaurants'),
      period: 'MONTHLY',
      limitMinor: 15000,
      currency: 'EUR',
      startsOn: '2020-01-01',
    });
    await app.get(GoalsRepository).create(fixture.household.id, {
      name: 'Summer Trip',
      type: 'TRAVEL',
      targetAmountMinor: 100000,
      currentAmountMinor: 62000,
      currency: 'EUR',
    });
    return fixture;
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    ai = new FakeAIProvider();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...TEST_CONFIG, databaseUrl: testDatabase.url })
      .overrideProvider(AI_PROVIDER)
      .useValue(ai)
      .overrideProvider(SECURITY_POLICY_TOKEN)
      .useValue(RELAXED_SECURITY_POLICY)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<Server>>({ rawBody: true });
    await app.init();
    auth = app.get(AuthService);
    for (const row of await testDatabase.database.select().from(categories)) {
      categoryIds.set(row.name, row.id);
    }
  });

  beforeEach(() => {
    ai.reviewRequests.length = 0;
    ai.willFailToExplainReview('UNAVAILABLE');
  });

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  describe('authentication', () => {
    const PROTECTED = [
      'session',
      'overview',
      'spending',
      'income',
      'budgets',
      'goals',
      'outlook',
      'signals',
      'review',
      'transactions',
      'accounts',
    ];

    it.each(PROTECTED)('refuses /dashboard/%s without a session', async (path) => {
      expect(await get(`/dashboard/${path}`)).toEqual({
        status: 401,
        body: { message: 'Unauthorized', statusCode: 401 },
      });
    });

    it('refuses a token that was never issued', async () => {
      expect((await get('/dashboard/overview', 'not-a-real-token')).status).toBe(401);
    });

    it.each([{ accessCode: 'wrong-code' }, { accessCode: '' }, {}, { accessCode: 42 }])(
      'does not sign in with %j',
      async (body) => {
        const response = await request(app.getHttpServer()).post('/auth/sessions').send(body);

        expect(response.status).toBe(401);
      },
    );

    it('signs a member in with their access code and returns no identifier', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Sign In', 2);
      const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 1).id);

      const response = await request(app.getHttpServer())
        .post('/auth/sessions')
        .send({ accessCode: code });

      expect(response.status).toBe(201);
      expect(Object.keys(response.body as object).sort()).toEqual(['expiresAt', 'member', 'token']);
      expect(response.body).toMatchObject({ member: memberAt(fixture, 1).name });
      expect(JSON.stringify(response.body)).not.toMatch(UUID);
    });

    it('stores only hashes of access codes and session tokens', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Hashes', 1);
      const token = await tokenFor(fixture);

      const stored = JSON.stringify(await testDatabase.database.select().from(dashboardSessions));

      expect(stored).not.toContain(token);
    });

    it('replaces an access code when a new one is issued', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Reissue', 1);
      const first = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);
      await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);

      const response = await request(app.getHttpServer())
        .post('/auth/sessions')
        .send({ accessCode: first });

      expect(response.status).toBe(401);
    });

    it('ends a session on sign-out', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Sign Out', 1);
      const token = await tokenFor(fixture);

      const signedOut = await request(app.getHttpServer())
        .delete('/auth/sessions/current')
        .set('Authorization', `Bearer ${token}`);

      expect(signedOut.status).toBe(204);
      expect((await get('/dashboard/session', token)).status).toBe(401);
    });

    it('refuses an expired session', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Expired', 1);
      const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);
      const longAgo = new Date(Date.now() - 30 * 86_400_000);
      const session = await auth.signIn(code, longAgo);

      expect((await get('/dashboard/session', session?.token)).status).toBe(401);
    });
  });

  describe('an established household', () => {
    let fixture: HouseholdFixture;
    let token: string;

    beforeAll(async () => {
      fixture = await establishedHousehold('Established Dashboard');
      token = await tokenFor(fixture);
    });

    it('describes the session and the months that can be selected', async () => {
      const session = await view(sessionSchema, '/dashboard/session', token);

      expect(session).toMatchObject({
        member: memberAt(fixture, 0).name,
        household: 'Established Dashboard',
        currency: 'EUR',
        timezone: 'UTC',
        today: TODAY,
      });
      expect(session.months.map((month) => month.key)).toEqual([
        keyOf(THIS_MONTH),
        keyOf(LAST_MONTH),
        keyOf(TWO_MONTHS_AGO),
      ]);
    });

    it('gives the overview of the current month with the figures of the finance engine', async () => {
      const overview = await view(overviewSchema, '/dashboard/overview', token);
      const engine = await app
        .get(FinanceService)
        .cashFlow(fixture.household.id, { start: THIS_MONTH.start, end: TODAY });
      const [eur] = overview.currencies;

      expect(overview.month).toMatchObject({
        key: keyOf(THIS_MONTH),
        asOf: TODAY,
        period: THIS_MONTH,
      });
      expect(overview.currencies).toHaveLength(1);
      expect(eur?.totals).toEqual({
        income: { minor: engine.cashFlow.incomeMinor, text: '€3,000.00' },
        expenses: { minor: engine.cashFlow.expensesMinor, text: '€2,220.00' },
        net: { minor: engine.cashFlow.netMinor, text: '€780.00' },
        savingsRate: { basisPoints: 2600, text: '26%' },
      });
      expect(eur?.comparison?.expenses).toMatchObject({
        current: { minor: 222000 },
        previous: { minor: 213000 },
        direction: 'INCREASE',
      });
      expect(eur?.budgets).toEqual([
        expect.objectContaining({
          category: 'Restaurants',
          limit: { minor: 15000, text: '€150.00' },
          spent: { minor: 18000, text: '€180.00' },
          usage: { basisPoints: 12000, text: '120%' },
          status: 'EXCEEDED',
        }),
      ]);
      expect(eur?.findings).toEqual(
        expect.arrayContaining([
          {
            kind: 'CONCERN',
            code: 'BUDGET_EXCEEDED',
            statement: 'The Restaurants budget of €150.00 is exceeded, with €180.00 spent (120%).',
          },
        ]),
      );
      expect(eur?.spendingByMember.map((member) => member.member)).toEqual(
        expect.arrayContaining(fixture.members.map((member) => member.name)),
      );
    });

    it('gives a completed month in full, without a forecast or balances', async () => {
      const overview = await view(
        overviewSchema,
        `/dashboard/overview?month=${keyOf(LAST_MONTH)}`,
        token,
      );

      expect(overview.month).toMatchObject({
        key: keyOf(LAST_MONTH),
        isComplete: true,
        asOf: LAST_MONTH.end,
      });
      expect(overview.currencies[0]).toMatchObject({
        totals: { expenses: { minor: 213000 } },
        forecast: null,
        balances: null,
      });
    });

    it('makes no comparison for the earliest month', async () => {
      const overview = await view(
        overviewSchema,
        `/dashboard/overview?month=${keyOf(TWO_MONTHS_AGO)}`,
        token,
      );
      const spending = await view(
        spendingSchema,
        `/dashboard/spending?month=${keyOf(TWO_MONTHS_AGO)}`,
        token,
      );

      expect(overview.currencies[0]?.comparison).toBeNull();
      expect(spending.currencies[0]).toMatchObject({
        comparison: null,
        previousPeriod: null,
        categoryIncreases: [],
      });
    });

    it.each(['2026-13', '26-10', 'october', '2999-01', addDays(THIS_MONTH.end, 1).slice(0, 7)])(
      'rejects the month "%s"',
      async (month) => {
        expect((await get(`/dashboard/overview?month=${month}`, token)).status).toBe(400);
      },
    );

    it('breaks spending down by category, member and account with the largest expenses', async () => {
      const spending = await view(spendingSchema, '/dashboard/spending', token);
      const [eur] = spending.currencies;
      const byCategory = new Map(eur?.byCategory.map((row) => [row.category, row]));

      expect(eur?.total).toEqual({ minor: 222000, text: '€2,220.00' });
      expect(byCategory.get('Food')).toMatchObject({ isTopLevel: true, total: { minor: 42000 } });
      expect(byCategory.get('Restaurants')).toMatchObject({
        isTopLevel: false,
        total: { minor: 18000 },
      });
      expect(eur?.largestExpenses[0]).toEqual({
        date: THIS_MONTH.start,
        amount: { minor: 180000, text: '€1,800.00' },
        merchant: 'Landlord',
        category: 'Rent',
        member: memberAt(fixture, 0).name,
        account: 'Joint Account',
      });
      expect(eur?.byAccount).toEqual([
        {
          account: 'Joint Account',
          total: { minor: 222000, text: '€2,220.00' },
          share: { basisPoints: 10000, text: '100%' },
        },
      ]);
      expect(eur?.categoryIncreases.map((change) => change.category)).toEqual(
        expect.arrayContaining(['Restaurants']),
      );
    });

    it('breaks income down by member and category', async () => {
      const income = await view(incomeSchema, '/dashboard/income', token);

      expect(income.currencies[0]).toMatchObject({
        total: { minor: 300000, text: '€3,000.00' },
        comparison: { direction: 'UNCHANGED' },
        byCategory: [{ category: 'Salary', total: { minor: 300000 } }],
      });
      expect(income.currencies[0]?.byMember[0]).toMatchObject({
        member: memberAt(fixture, 0).name,
        total: { minor: 300000 },
      });
    });

    it('reports budgets with member attribution and projection', async () => {
      const budgets = await view(budgetsSchema, '/dashboard/budgets', token);
      const [budget] = budgets.currencies[0]?.budgets ?? [];

      expect(budget).toMatchObject({
        category: 'Restaurants',
        remaining: { minor: -3000, text: '-€30.00' },
        status: 'EXCEEDED',
        alertThresholdPercent: 80,
      });
      expect(budget?.byMember.find((row) => row.total.minor > 0)).toMatchObject({
        member: memberAt(fixture, 2).name,
        total: { minor: 18000 },
      });
    });

    it('reports goals by name', async () => {
      const goals = await view(goalsSchema, '/dashboard/goals', token);

      expect(goals.currencies[0]?.goals).toEqual([
        {
          goal: 'Summer Trip',
          target: { minor: 100000, text: '€1,000.00' },
          saved: { minor: 62000, text: '€620.00' },
          remaining: { minor: 38000, text: '€380.00' },
          progress: { basisPoints: 6200, text: '62%' },
          state: 'IN_PROGRESS',
          targetDate: null,
          daysRemaining: null,
          requiredMonthly: null,
        },
      ]);
    });

    it('reports the forecast, the outlook and recurring commitments', async () => {
      const outlook = await view(outlookViewSchema, '/dashboard/outlook', token);
      const [eur] = outlook.currencies;

      expect(eur?.forecast).toMatchObject({
        spent: { minor: 222000 },
        method: 'HISTORICAL_REMAINDER',
      });
      expect(eur?.outlook).toMatchObject({ expectedIncome: { minor: 300000 } });
      expect(eur?.actual.expenses).toEqual({ minor: 222000, text: '€2,220.00' });
      expect(eur?.recurring.commitments.map((commitment) => commitment.merchant)).toEqual(
        expect.arrayContaining(['Landlord', 'Lidl']),
      );
      expect(eur?.recurring.commitments[0]).toMatchObject({
        merchant: 'Landlord',
        frequency: 'MONTHLY',
        typicalAmount: { minor: 180000 },
        lastDate: THIS_MONTH.start,
      });
    });

    it('reports insights and anomalies as described signals', async () => {
      const signals = await view(signalsSchema, '/dashboard/signals', token);
      const insights = signals.currencies[0]?.insights ?? [];

      expect(insights[0]).toEqual({
        type: 'BUDGET_EXCEEDED',
        severity: 'HIGH',
        title: 'Restaurants budget exceeded',
        detail: '€180.00 of €150.00 spent (120%).',
        date: null,
      });
      expect(insights.map((insight) => insight.type)).toEqual(
        expect.arrayContaining(['NEW_RECURRING_EXPENSE']),
      );
    });

    it('returns the deterministic review when the model is unavailable', async () => {
      const review = await view(reviewSchema, '/dashboard/review', token);

      expect(review).toMatchObject({ source: 'DETERMINISTIC', currencies: ['EUR'] });
      expect(review.summary).toContain('income was €3,000.00 and spending was €2,220.00');
      expect(review.concerns).toContain(
        'The Restaurants budget of €150.00 is exceeded, with €180.00 spent (120%).',
      );
    });

    it('returns the narrative of the model when it is grounded in the review', async () => {
      ai.willExplainReviewAs({
        summary: 'Entraram €3,000.00 e saíram €2,220.00.',
        strengths: ['Poupança de 26%.'],
        concerns: [],
        recommendations: [],
        priorities: [],
      });

      const review = await view(
        reviewSchema,
        `/dashboard/review?month=${keyOf(THIS_MONTH)}`,
        token,
      );

      expect(review).toMatchObject({
        source: 'AI',
        summary: 'Entraram €3,000.00 e saíram €2,220.00.',
      });
      expect(JSON.stringify(ai.reviewRequests)).not.toMatch(UUID);
    });

    it('lists transactions with names and filter options', async () => {
      const history = await view(transactionsSchema, '/dashboard/transactions', token);

      expect(history).toMatchObject({ total: 4, page: 1, pageCount: 1 });
      expect(history.transactions[0]).toEqual(
        expect.objectContaining({
          date: THIS_MONTH.start,
          currency: 'EUR',
          account: 'Joint Account',
        }),
      );
      expect(JSON.stringify(history.transactions)).not.toMatch(UUID);
      expect(history.filters.types).toEqual(['EXPENSE', 'INCOME', 'TRANSFER']);
      expect(history.filters.members.map((option) => option.name)).toEqual(
        fixture.members.map((member) => member.name),
      );
    });

    it('filters transactions by type, category with its subcategories, member and account', async () => {
      const options = (await view(transactionsSchema, '/dashboard/transactions', token)).filters;
      const food = options.categories.find((option) => option.name === 'Food')?.key ?? '';
      const lastMember = options.members.at(-1)?.key ?? '';
      const joint = options.accounts[0]?.key ?? '';

      const income = await view(transactionsSchema, '/dashboard/transactions?type=INCOME', token);
      const inFood = await view(
        transactionsSchema,
        `/dashboard/transactions?category=${food}`,
        token,
      );
      const byMember = await view(
        transactionsSchema,
        `/dashboard/transactions?member=${lastMember}`,
        token,
      );
      const byAccount = await view(
        transactionsSchema,
        `/dashboard/transactions?account=${joint}&month=${keyOf(LAST_MONTH)}`,
        token,
      );

      expect(income.transactions.map((row) => row.type)).toEqual(['INCOME']);
      expect(inFood.transactions.map((row) => row.category).sort()).toEqual([
        'Groceries',
        'Restaurants',
      ]);
      expect(byMember.transactions.map((row) => row.merchant)).toEqual(['Bistro']);
      expect(byAccount).toMatchObject({ total: 4, month: { key: keyOf(LAST_MONTH) } });
    });

    it.each(['type=REFUND', 'category=food', 'page=0', 'page=abc', 'member=1'])(
      'rejects the transaction query "%s"',
      async (query) => {
        expect((await get(`/dashboard/transactions?${query}`, token)).status).toBe(400);
      },
    );

    it('lists accounts with balances, ownership and members', async () => {
      await app.get(AccountsRepository).create(fixture.household.id, {
        name: 'Personal',
        type: 'BANK',
        currency: 'EUR',
        ownerMemberId: memberAt(fixture, 1).id,
        openingBalanceMinor: 50000,
      });

      const accounts = await view(accountsSchema, '/dashboard/accounts', token);

      expect(accounts.accounts).toEqual([
        {
          name: 'Joint Account',
          type: 'BANK',
          currency: 'EUR',
          owner: 'Joint',
          isJoint: true,
          balance: { minor: 261000, text: '€2,610.00' },
        },
        {
          name: 'Personal',
          type: 'BANK',
          currency: 'EUR',
          owner: memberAt(fixture, 1).name,
          isJoint: false,
          balance: { minor: 50000, text: '€500.00' },
        },
      ]);
      expect(accounts.totals[0]).toMatchObject({
        currency: 'EUR',
        total: { minor: 311000 },
        joint: { minor: 261000 },
      });
      expect(accounts.members).toHaveLength(3);
    });

    it('exposes no internal identifier outside the transaction filter options', async () => {
      const paths = [
        'session',
        'overview',
        'spending',
        'income',
        'budgets',
        'goals',
        'outlook',
        'signals',
        'review',
        'accounts',
      ];

      for (const path of paths) {
        const response = await get(`/dashboard/${path}`, token);

        expect(JSON.stringify(response.body)).not.toMatch(UUID);
        expect(JSON.stringify(response.body)).not.toMatch(
          /householdId|memberId|accountId|categoryId/,
        );
      }
    });
  });

  describe('household isolation', () => {
    let own: HouseholdFixture;
    let other: HouseholdFixture;
    let ownToken: string;

    beforeAll(async () => {
      own = await createHouseholdFixture(testDatabase.database, 'Isolated Own', 2);
      other = await establishedHousehold('Isolated Other', 2);
      await record(own, 0, [
        { amountMinor: 4200, categoryId: category('Groceries'), merchant: 'Corner Shop' },
      ]);
      ownToken = await tokenFor(own);
    });

    it('returns only the data of the household of the session', async () => {
      const overview = await view(overviewSchema, '/dashboard/overview', ownToken);
      const history = await view(transactionsSchema, '/dashboard/transactions', ownToken);
      const accounts = await view(accountsSchema, '/dashboard/accounts', ownToken);
      const everything = JSON.stringify([overview, history, accounts]);

      expect(overview.currencies[0]?.totals.expenses).toEqual({ minor: 4200, text: '€42.00' });
      expect(history.total).toBe(1);
      expect(accounts.accounts).toHaveLength(1);
      expect(everything).not.toMatch(/Landlord|Bistro|Summer Trip/);
      expect(everything).not.toContain(memberAt(other, 0).name);
    });

    it.each(['householdId', 'household_id', 'household', 'memberId'])(
      'ignores a client-supplied %s',
      async (parameter) => {
        const identifier = parameter.startsWith('member')
          ? memberAt(other, 0).id
          : other.household.id;
        const paths = ['overview', 'spending', 'transactions', 'accounts', 'session'];

        for (const path of paths) {
          const response = await get(`/dashboard/${path}?${parameter}=${identifier}`, ownToken);

          expect(response.status).toBe(200);
          expect(JSON.stringify(response.body)).not.toMatch(/Landlord|Bistro|Isolated Other/);
        }
      },
    );

    it('finds nothing when a filter names a member, account or category of another household', async () => {
      const otherToken = await tokenFor(other);
      const otherOptions = (await view(transactionsSchema, '/dashboard/transactions', otherToken))
        .filters;
      const filters = [
        `member=${otherOptions.members[0]?.key ?? ''}`,
        `account=${otherOptions.accounts[0]?.key ?? ''}`,
      ];

      for (const filter of filters) {
        const history = await view(
          transactionsSchema,
          `/dashboard/transactions?${filter}`,
          ownToken,
        );

        expect(history).toMatchObject({ total: 0, transactions: [] });
      }
    });

    it('gives each member of a household the same household view', async () => {
      const first = await view(overviewSchema, '/dashboard/overview', ownToken);
      const second = await view(overviewSchema, '/dashboard/overview', await tokenFor(own, 1));

      expect(second).toEqual(first);
    });
  });

  describe('currencies and empty households', () => {
    it('keeps each currency in its own section and never combines them', async () => {
      const fixture = await createHouseholdFixture(
        testDatabase.database,
        'Dashboard Currencies',
        1,
      );
      const reais = await app
        .get(AccountsRepository)
        .create(fixture.household.id, { name: 'Reais', type: 'BANK', currency: 'BRL' });
      await record(fixture, 0, [
        { amountMinor: 100000 },
        { amountMinor: 50000, accountId: reais.id, currency: 'BRL' },
      ]);
      const token = await tokenFor(fixture);

      const overview = await view(overviewSchema, '/dashboard/overview', token);
      const spending = await view(spendingSchema, '/dashboard/spending', token);
      const accounts = await view(accountsSchema, '/dashboard/accounts', token);

      expect(
        overview.currencies.map((entry) => [entry.currency, entry.totals.expenses.text]),
      ).toEqual([
        ['EUR', '€1,000.00'],
        ['BRL', 'R$500.00'],
      ]);
      expect(spending.currencies.map((entry) => entry.total.minor)).toEqual([100000, 50000]);
      expect(accounts.totals.map((entry) => entry.currency)).toEqual(['BRL', 'EUR']);
      expect(JSON.stringify([overview, spending, accounts])).not.toContain('150000');
    });

    it('describes an empty household without inventing figures', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Empty Dashboard', 1);
      const token = await tokenFor(fixture);

      const session = await view(sessionSchema, '/dashboard/session', token);
      const overview = await view(overviewSchema, '/dashboard/overview', token);
      const history = await view(transactionsSchema, '/dashboard/transactions', token);
      const signals = await view(signalsSchema, '/dashboard/signals', token);
      const review = await view(reviewSchema, '/dashboard/review', token);

      expect(session.months).toHaveLength(1);
      expect(overview.currencies[0]).toMatchObject({
        hasTransactions: false,
        totals: { income: { minor: 0 }, expenses: { minor: 0 }, savingsRate: null },
        comparison: null,
        budgets: [],
        findings: [],
        topCategories: [],
      });
      expect(history).toMatchObject({ total: 0, transactions: [], pageCount: 1 });
      expect(signals.currencies[0]).toMatchObject({ insights: [], anomalies: [] });
      expect(review.summary).toContain('No transactions are recorded');
    });
  });

  describe('notifications', () => {
    async function post(path: string, token?: string): Promise<number> {
      const call = request(app.getHttpServer()).post(path);
      const response = await (token === undefined
        ? call
        : call.set('Authorization', `Bearer ${token}`));
      return response.status;
    }

    it('lists the proactive notifications of the household with their status', async () => {
      const fixture = await establishedHousehold('Notified Dashboard');
      const token = await tokenFor(fixture);
      await app.get(ProactiveCfoService).evaluateHousehold(fixture.household.id, new Date());

      const listed = await view(notificationsSchema, '/dashboard/notifications', token);

      const exceeded = listed.notifications.find((entry) => entry.type === 'BUDGET_EXCEEDED');
      expect(exceeded).toMatchObject({
        severity: 'HIGH',
        status: 'SUPPRESSED',
        title: 'Restaurants budget exceeded',
        currency: 'EUR',
        period: keyOf(THIS_MONTH),
        notifiedAt: null,
        isRead: false,
      });
      expect(exceeded?.detail).toContain('€180.00 of €150.00');
      expect(
        JSON.stringify(listed.notifications.map((entry) => ({ ...entry, key: '' }))),
      ).not.toMatch(UUID);
    });

    it('marks a notification read, once and only for its own household', async () => {
      const fixture = await establishedHousehold('Reading Dashboard');
      const other = await establishedHousehold('Other Reading Dashboard');
      const token = await tokenFor(fixture);
      const otherToken = await tokenFor(other, 1);
      await app.get(ProactiveCfoService).evaluateHousehold(fixture.household.id, new Date());
      const before = await view(notificationsSchema, '/dashboard/notifications', token);
      const key = before.notifications[0]?.key ?? '';

      expect(await post(`/dashboard/notifications/${key}/read`, otherToken)).toBe(404);
      expect(await post(`/dashboard/notifications/${key}/read`)).toBe(401);
      expect(await post('/dashboard/notifications/not-a-key/read', token)).toBe(404);
      expect(await post(`/dashboard/notifications/${key}/read`, token)).toBe(204);
      expect(await post(`/dashboard/notifications/${key}/read`, token)).toBe(204);

      const after = await view(notificationsSchema, '/dashboard/notifications', token);
      const others = await view(notificationsSchema, '/dashboard/notifications', otherToken);
      expect(after.notifications.find((entry) => entry.key === key)?.isRead).toBe(true);
      expect(after.notifications.filter((entry) => entry.isRead)).toHaveLength(1);
      expect(others.notifications).toEqual([]);
    });

    it('requires a session to list notifications', async () => {
      expect((await get('/dashboard/notifications')).status).toBe(401);
    });
  });

  describe('recurring commitments', () => {
    it('lists commitments with monthly and annual equivalents, payers and what is new', async () => {
      const fixture = await establishedHousehold('Recurring Dashboard');
      const token = await tokenFor(fixture);

      const recurring = await view(recurringSchema, '/dashboard/recurring', token);
      const [eur] = recurring.currencies;

      expect(recurring.sort).toBe('cost');
      expect(eur).toMatchObject({
        currency: 'EUR',
        monthlyEquivalent: { minor: 204000, text: '€2,040.00' },
        annualEquivalent: { minor: 2448000, text: '€24,480.00' },
        stopped: [],
      });
      expect(eur?.commitments).toMatchObject([
        {
          merchant: 'Landlord',
          frequency: 'MONTHLY',
          category: 'Rent',
          typicalAmount: { text: '€1,800.00' },
          annualEquivalent: { text: '€21,600.00' },
          occurrences: 3,
          lastDate: THIS_MONTH.start,
          isNew: true,
          priceChange: null,
          payers: [{ member: 'Recurring Dashboard Member 1', occurrences: 3 }],
        },
        { merchant: 'Lidl', annualEquivalent: { text: '€2,880.00' } },
      ]);
      expect(JSON.stringify(recurring)).not.toMatch(UUID);
    });

    it('sorts by name or by next expected date when asked, and rejects anything else', async () => {
      const fixture = await establishedHousehold('Recurring Sorting');
      const token = await tokenFor(fixture);
      await record(fixture, 0, [
        {
          amountMinor: 999,
          merchant: 'Aardvark Cloud',
          transactionDate: addDays(THIS_MONTH.start, -70),
        },
        {
          amountMinor: 999,
          merchant: 'Aardvark Cloud',
          transactionDate: addDays(THIS_MONTH.start, -40),
        },
        {
          amountMinor: 999,
          merchant: 'Aardvark Cloud',
          transactionDate: addDays(THIS_MONTH.start, -10),
        },
      ]);

      const byName = await view(recurringSchema, '/dashboard/recurring?sort=name', token);
      const byNext = await view(recurringSchema, '/dashboard/recurring?sort=next', token);
      const byCost = await view(recurringSchema, '/dashboard/recurring', token);
      const merchants = (page: typeof byName): string[] =>
        page.currencies[0]?.commitments.map((commitment) => commitment.merchant) ?? [];

      expect(merchants(byName)).toEqual(['Aardvark Cloud', 'Landlord', 'Lidl']);
      expect(merchants(byNext)[0]).toBe('Aardvark Cloud');
      expect(merchants(byCost)).toEqual(['Landlord', 'Lidl', 'Aardvark Cloud']);
      expect((await get('/dashboard/recurring?sort=amount', token)).status).toBe(400);
    });

    it('shows an empty state for a household without history and requires a session', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Recurring Empty', 1);
      const token = await tokenFor(fixture);

      const recurring = await view(recurringSchema, '/dashboard/recurring', token);

      expect(recurring.currencies).toEqual([
        {
          currency: 'EUR',
          monthlyEquivalent: { minor: 0, text: '€0.00' },
          annualEquivalent: { minor: 0, text: '€0.00' },
          commitments: [],
          stopped: [],
          upcoming: { withinDays: 14, total: { minor: 0, text: '€0.00' }, merchants: [] },
        },
      ]);
      expect((await get('/dashboard/recurring')).status).toBe(401);
    });

    it('never shows another household its commitments', async () => {
      const fixture = await establishedHousehold('Recurring Owner');
      const other = await createHouseholdFixture(testDatabase.database, 'Recurring Visitor', 2);
      const otherToken = await tokenFor(other, 1);

      const theirs = await view(recurringSchema, '/dashboard/recurring', otherToken);
      const mine = await view(recurringSchema, '/dashboard/recurring', await tokenFor(fixture));

      expect(theirs.currencies[0]?.commitments).toEqual([]);
      expect(mine.currencies[0]?.commitments).toHaveLength(2);
    });
  });
});
