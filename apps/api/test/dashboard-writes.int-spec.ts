import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { z } from 'zod';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { FakeAIProvider } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { budgets } from '../src/budgets/budgets.schema.js';
import { categories } from '../src/categories/categories.schema.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import {
  budgetEditSchema,
  budgetsSchema,
  goalEditSchema,
  goalsSchema,
  savedSchema,
  transactionEditSchema,
  transactionsSchema,
} from '../src/dashboard/dashboard.contracts.js';
import { monthContaining } from '../src/finance/domain/period/period.js';
import { goals } from '../src/goals/goals.schema.js';
import { households } from '../src/households/households.schema.js';
import { proactiveNotifications } from '../src/proactive/proactive-notifications.schema.js';
import { SECURITY_POLICY_TOKEN } from '../src/security/security-policy.js';
import { transactions } from '../src/transactions/transactions.schema.js';
import { RELAXED_SECURITY_POLICY, TEST_CONFIG } from './support/assistant-harness.js';
import {
  createHouseholdFixture,
  memberAt,
  type HouseholdFixture,
} from './support/household-fixture.js';
import { createTestDatabase, type TestDatabase } from './support/test-database.js';

const TODAY = new Date().toISOString().slice(0, 10);
const THIS_MONTH = monthContaining(TODAY);
const MISSING_KEY = '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b';

interface Response {
  readonly status: number;
  readonly body: unknown;
}

describe('dashboard writes', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let auth: AuthService;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    const id = categoryIds.get(name);
    if (id === undefined) {
      throw new Error(`Unknown category ${name}`);
    }
    return id;
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

  async function send(
    method: 'get' | 'post' | 'patch' | 'delete',
    path: string,
    token: string | undefined,
    body?: object,
  ): Promise<Response> {
    let call = request(app.getHttpServer())[method](path);
    if (token !== undefined) {
      call = call.set('Authorization', `Bearer ${token}`);
    }
    const response = await (body === undefined ? call : call.send(body));
    return { status: response.status, body: response.body as unknown };
  }

  async function view<Schema extends z.ZodType>(
    schema: Schema,
    path: string,
    token: string,
  ): Promise<z.output<Schema>> {
    const response = await send('get', path, token);
    expect(response.status).toBe(200);
    expect(schema.parse(response.body)).toEqual(response.body);
    return response.body as z.output<Schema>;
  }

  async function expense(
    fixture: HouseholdFixture,
    values: Partial<typeof transactions.$inferInsert> = {},
  ): Promise<string> {
    const [row] = await testDatabase.database
      .insert(transactions)
      .values({
        householdId: fixture.household.id,
        memberId: memberAt(fixture, 0).id,
        accountId: fixture.jointAccount.id,
        type: 'EXPENSE',
        amountMinor: 24000,
        currency: 'EUR',
        categoryId: category('Groceries'),
        merchant: 'Lidl',
        transactionDate: THIS_MONTH.start,
        source: 'WHATSAPP_TEXT',
        ...values,
      })
      .returning({ id: transactions.id });
    return row?.id ?? '';
  }

  async function storedTransaction(
    id: string,
  ): Promise<typeof transactions.$inferSelect | undefined> {
    const [row] = await testDatabase.database
      .select()
      .from(transactions)
      .where(eq(transactions.id, id));
    return row;
  }

  function editOf(current: z.output<typeof transactionEditSchema>): Record<string, string> {
    return {
      version: current.version,
      type: current.type,
      amount: current.amount,
      date: current.date,
      merchant: current.merchant ?? '',
      description: current.description ?? '',
      category: current.categoryKey ?? '',
      member: current.memberKey,
      account: current.accountKey,
      expenseScope: current.expenseScope,
    };
  }

  beforeAll(async () => {
    Logger.overrideLogger(false);
    testDatabase = await createTestDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue({ ...TEST_CONFIG, databaseUrl: testDatabase.url })
      .overrideProvider(AI_PROVIDER)
      .useValue(new FakeAIProvider())
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

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  describe('transactions', () => {
    it('lists each transaction with the key that opens it for editing', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Listed', 2);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);

      const listed = await view(transactionsSchema, '/dashboard/transactions', token);
      const editable = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      expect(listed.transactions.map((row) => row.key)).toEqual([id]);
      expect(editable).toMatchObject({
        key: id,
        type: 'EXPENSE',
        amount: '240.00',
        currency: 'EUR',
        date: THIS_MONTH.start,
        merchant: 'Lidl',
        categoryKey: category('Groceries'),
        memberKey: memberAt(fixture, 0).id,
        accountKey: fixture.jointAccount.id,
        transferAccount: null,
        source: 'WHATSAPP_TEXT',
      });
      expect(editable.options.members.map((member) => member.key)).toEqual(
        fixture.members.map((member) => member.id),
      );
      expect(editable.options.accounts).toEqual([
        { key: fixture.jointAccount.id, name: 'Joint Account', currency: 'EUR' },
      ]);
      expect(editable.options.categories).toContainEqual({
        key: category('Salary'),
        name: 'Salary',
        kind: 'INCOME',
      });
    });

    it('writes the amount for editing in the household language', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Lusophone', 1);
      await testDatabase.database
        .update(households)
        .set({ locale: 'pt-BR' })
        .where(eq(households.id, fixture.household.id));
      const token = await tokenFor(fixture);
      const id = await expense(fixture, { amountMinor: 182698 });

      const editable = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      expect(editable.amount).toBe('1826,98');
    });

    it('saves an edit, moving the expense to another member and category', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Corrected', 2);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const saved = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        amount: '1.234,56',
        merchant: '  Bistro  ',
        description: '',
        category: category('Restaurants'),
        member: memberAt(fixture, 1).id,
        expenseScope: 'INDIVIDUAL',
      });

      expect(saved.status).toBe(200);
      expect(savedSchema.parse(saved.body)).toMatchObject({ key: id });
      expect((saved.body as { version: string }).version).not.toBe(current.version);
      expect(await storedTransaction(id)).toMatchObject({
        amountMinor: 123456,
        merchant: 'Bistro',
        description: null,
        categoryId: category('Restaurants'),
        memberId: memberAt(fixture, 1).id,
        expenseScope: 'INDIVIDUAL',
        source: 'WHATSAPP_TEXT',
      });
    });

    it('turns an expense into income, which is how a salary recorded the wrong way is fixed', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Salaried', 2);
      const token = await tokenFor(fixture);
      const id = await expense(fixture, { categoryId: null, merchant: null });
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const saved = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        type: 'INCOME',
        amount: '900',
        category: category('Salary'),
        member: memberAt(fixture, 1).id,
      });

      expect(saved.status).toBe(200);
      expect(await storedTransaction(id)).toMatchObject({
        type: 'INCOME',
        amountMinor: 90000,
        categoryId: category('Salary'),
        memberId: memberAt(fixture, 1).id,
      });
    });

    it('moves a transaction to an account in another currency, reading the amount in it', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Two Currencies', 1);
      const real = await app.get(AccountsRepository).create(fixture.household.id, {
        name: 'Conta Real',
        type: 'BANK',
        currency: 'BRL',
      });
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const saved = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        account: real.id,
        amount: '45,90',
      });

      expect(saved.status).toBe(200);
      expect(await storedTransaction(id)).toMatchObject({
        accountId: real.id,
        currency: 'BRL',
        amountMinor: 4590,
      });
    });

    it('refuses an edit made from an out-of-date copy', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Two Tabs', 1);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);
      const first = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        amount: '10',
      });

      const second = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        amount: '20',
      });

      expect(first.status).toBe(200);
      expect(second).toEqual({ status: 409, body: { code: 'STALE' } });
      expect((await storedTransaction(id))?.amountMinor).toBe(1000);
    });

    it.each([
      [{ amount: '12,345,6' }, [{ field: 'amount', code: 'INVALID_AMOUNT' }]],
      [{ amount: '0' }, [{ field: 'amount', code: 'INVALID_AMOUNT' }]],
      [{ date: '2026-02-30' }, [{ field: 'date', code: 'INVALID' }]],
      [{ type: 'TRANSFER' }, [{ field: 'type', code: 'NOT_ALLOWED' }]],
      [{ merchant: 'x'.repeat(201) }, [{ field: 'merchant', code: 'INVALID' }]],
      [{ member: 'not-a-key' }, [{ field: 'member', code: 'INVALID' }]],
      [{ member: MISSING_KEY }, [{ field: 'member', code: 'UNKNOWN' }]],
      [{ account: MISSING_KEY }, [{ field: 'account', code: 'UNKNOWN' }]],
      [{ category: MISSING_KEY }, [{ field: 'category', code: 'UNKNOWN' }]],
      [{ version: undefined }, [{ field: 'version', code: 'REQUIRED' }]],
    ])('explains which field is wrong in %j', async (change, errors) => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Mistyped', 1);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const refused = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        ...change,
      });

      expect(refused).toEqual({ status: 422, body: { errors } });
      expect((await storedTransaction(id))?.amountMinor).toBe(24000);
    });

    it('refuses an income category on an expense', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Mismatched', 1);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const refused = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        category: category('Salary'),
      });

      expect(refused).toEqual({
        status: 422,
        body: { errors: [{ field: 'category', code: 'KIND_MISMATCH' }] },
      });
    });

    it('deletes a transaction for good', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Tidy', 1);
      const token = await tokenFor(fixture);
      const id = await expense(fixture);
      const kept = await expense(fixture, { merchant: 'Kept' });

      const deleted = await send('delete', `/dashboard/transactions/${id}`, token);
      const again = await send('delete', `/dashboard/transactions/${id}`, token);

      expect(deleted.status).toBe(204);
      expect(again.status).toBe(404);
      expect(await storedTransaction(id)).toBeUndefined();
      expect(await storedTransaction(kept)).toBeDefined();
      expect((await send('get', `/dashboard/transactions/${id}`, token)).status).toBe(404);
    });

    it('treats another household’s transaction exactly like one that does not exist', async () => {
      const owner = await createHouseholdFixture(testDatabase.database, 'Owner', 1);
      const intruder = await createHouseholdFixture(testDatabase.database, 'Intruder', 1);
      const intruderToken = await tokenFor(intruder);
      const ownerToken = await tokenFor(owner);
      const id = await expense(owner);
      const current = await view(
        transactionEditSchema,
        `/dashboard/transactions/${id}`,
        ownerToken,
      );

      const attempts = [
        await send('get', `/dashboard/transactions/${id}`, intruderToken),
        await send('patch', `/dashboard/transactions/${id}`, intruderToken, {
          ...editOf(current),
          member: memberAt(intruder, 0).id,
          account: intruder.jointAccount.id,
        }),
        await send('delete', `/dashboard/transactions/${id}`, intruderToken),
        await send('get', `/dashboard/transactions/${MISSING_KEY}`, intruderToken),
        await send('get', '/dashboard/transactions/not-a-key', intruderToken),
      ];

      expect(attempts.map((attempt) => attempt.status)).toEqual([404, 404, 404, 404, 404]);
      expect(await storedTransaction(id)).toMatchObject({
        householdId: owner.household.id,
        memberId: memberAt(owner, 0).id,
        amountMinor: 24000,
      });
    });

    it('refuses to point a transaction at another household’s member or account', async () => {
      const owner = await createHouseholdFixture(testDatabase.database, 'Holder', 1);
      const other = await createHouseholdFixture(testDatabase.database, 'Neighbour', 1);
      const token = await tokenFor(owner);
      const id = await expense(owner);
      const current = await view(transactionEditSchema, `/dashboard/transactions/${id}`, token);

      const foreignMember = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        member: memberAt(other, 0).id,
      });
      const foreignAccount = await send('patch', `/dashboard/transactions/${id}`, token, {
        ...editOf(current),
        account: other.jointAccount.id,
      });

      expect(foreignMember).toEqual({
        status: 422,
        body: { errors: [{ field: 'member', code: 'UNKNOWN' }] },
      });
      expect(foreignAccount).toEqual({
        status: 422,
        body: { errors: [{ field: 'account', code: 'UNKNOWN' }] },
      });
      expect(await storedTransaction(id)).toMatchObject({
        memberId: memberAt(owner, 0).id,
        accountId: owner.jointAccount.id,
      });
    });

    it('requires a session for every write', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Anonymous', 1);
      const id = await expense(fixture);

      const attempts = [
        await send('get', `/dashboard/transactions/${id}`, undefined),
        await send('patch', `/dashboard/transactions/${id}`, undefined, { amount: '1' }),
        await send('delete', `/dashboard/transactions/${id}`, undefined),
        await send('post', '/dashboard/budgets', undefined, {}),
        await send('post', '/dashboard/goals', undefined, {}),
      ];

      expect(attempts.map((attempt) => attempt.status)).toEqual([401, 401, 401, 401, 401]);
      expect(await storedTransaction(id)).toBeDefined();
    });
  });

  describe('budgets', () => {
    function budgetBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        category: category('Restaurants'),
        period: 'MONTHLY',
        limit: '150,00',
        currency: 'EUR',
        alertThresholdPercent: '80',
        startsOn: THIS_MONTH.start,
        endsOn: '',
        ...overrides,
      };
    }

    async function storedBudget(id: string): Promise<typeof budgets.$inferSelect | undefined> {
      const [row] = await testDatabase.database.select().from(budgets).where(eq(budgets.id, id));
      return row;
    }

    it('offers expense categories and household currencies for a new budget', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Planner', 1);
      await app.get(AccountsRepository).create(fixture.household.id, {
        name: 'Conta Real',
        type: 'BANK',
        currency: 'BRL',
      });
      const token = await tokenFor(fixture);

      const page = await view(budgetsSchema, '/dashboard/budgets', token);

      expect(page.options.currencies).toEqual(['EUR', 'BRL']);
      expect(page.options.defaultCurrency).toBe('EUR');
      expect(page.options.defaultStartsOn).toBe(THIS_MONTH.start);
      expect(page.options.periods).toEqual(['WEEKLY', 'MONTHLY', 'YEARLY']);
      expect(page.options.categories.map((option) => option.key)).toContain(
        category('Restaurants'),
      );
      expect(page.options.categories.map((option) => option.key)).not.toContain(category('Salary'));
    });

    it('creates a budget that the budgets page then tracks', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Budgeter', 1);
      const token = await tokenFor(fixture);

      const created = await send('post', '/dashboard/budgets', token, budgetBody());
      const { key } = savedSchema.parse(created.body);
      const page = await view(budgetsSchema, '/dashboard/budgets', token);

      expect(created.status).toBe(201);
      expect(await storedBudget(key)).toMatchObject({
        householdId: fixture.household.id,
        categoryId: category('Restaurants'),
        limitMinor: 15000,
        alertThresholdPercent: 80,
        endsOn: null,
      });
      expect(page.currencies[0]?.budgets).toEqual([
        expect.objectContaining({ key, category: 'Restaurants' }),
      ]);
    });

    it('creates a budget across all spending when no category is chosen', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Overall', 1);
      const token = await tokenFor(fixture);

      const created = await send('post', '/dashboard/budgets', token, budgetBody({ category: '' }));

      expect(created.status).toBe(201);
      expect(await storedBudget(savedSchema.parse(created.body).key)).toMatchObject({
        categoryId: null,
      });
    });

    it.each([
      [{ category: 'Salary' }, [{ field: 'category', code: 'KIND_MISMATCH' }]],
      [{ currency: 'USD' }, [{ field: 'currency', code: 'UNKNOWN' }]],
      [{ limit: 'abc' }, [{ field: 'limit', code: 'INVALID_AMOUNT' }]],
      [{ alertThresholdPercent: '0' }, [{ field: 'alertThresholdPercent', code: 'INVALID' }]],
      [{ period: 'DAILY' }, [{ field: 'period', code: 'INVALID' }]],
      [{ endsOn: '2000-01-01' }, [{ field: 'endsOn', code: 'ENDS_BEFORE_START' }]],
    ])('explains which field is wrong in %j', async (change, errors) => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Overspent', 1);
      const token = await tokenFor(fixture);
      const overrides =
        'category' in change ? { ...change, category: category(change.category) } : change;

      const refused = await send('post', '/dashboard/budgets', token, budgetBody(overrides));

      expect(refused).toEqual({ status: 422, body: { errors } });
    });

    it('refuses a second budget for the same category, period, currency and start', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Twice', 1);
      const token = await tokenFor(fixture);
      await send('post', '/dashboard/budgets', token, budgetBody());

      const refused = await send('post', '/dashboard/budgets', token, budgetBody());

      expect(refused).toEqual({
        status: 422,
        body: { errors: [{ field: 'category', code: 'DUPLICATE' }] },
      });
    });

    it('edits a budget and refuses an out-of-date copy', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Adjusted', 1);
      const token = await tokenFor(fixture);
      const { key } = savedSchema.parse(
        (await send('post', '/dashboard/budgets', token, budgetBody())).body,
      );
      const current = await view(budgetEditSchema, `/dashboard/budgets/${key}`, token);

      const saved = await send(
        'patch',
        `/dashboard/budgets/${key}`,
        token,
        budgetBody({ version: current.version, limit: '200', alertThresholdPercent: 90 }),
      );
      const stale = await send(
        'patch',
        `/dashboard/budgets/${key}`,
        token,
        budgetBody({ version: current.version, limit: '300' }),
      );

      expect(current).toMatchObject({
        key,
        categoryKey: category('Restaurants'),
        period: 'MONTHLY',
        limit: '150.00',
        currency: 'EUR',
        alertThresholdPercent: 80,
        startsOn: THIS_MONTH.start,
        endsOn: null,
      });
      expect(saved.status).toBe(200);
      expect(stale).toEqual({ status: 409, body: { code: 'STALE' } });
      expect(await storedBudget(key)).toMatchObject({
        limitMinor: 20000,
        alertThresholdPercent: 90,
      });
    });

    it('deletes a budget and silences the alerts still waiting to be sent about it', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Retired', 1);
      const token = await tokenFor(fixture);
      const budget = await app.get(BudgetsRepository).create(fixture.household.id, {
        categoryId: category('Restaurants'),
        period: 'MONTHLY',
        limitMinor: 15000,
        currency: 'EUR',
        startsOn: THIS_MONTH.start,
      });
      const instant = new Date();
      const notification = {
        householdId: fixture.household.id,
        type: 'BUDGET_NEAR_LIMIT',
        severity: 'MEDIUM',
        level: 1,
        currency: 'EUR',
        period: THIS_MONTH.start.slice(0, 7),
        title: 'Restaurants budget',
        body: 'Close to the limit',
        firstDetectedAt: instant,
        lastDetectedAt: instant,
      };
      await testDatabase.database.insert(proactiveNotifications).values([
        {
          ...notification,
          eventKey: `EUR:BUDGET:${budget.id}:${THIS_MONTH.start}`,
          status: 'PENDING',
        },
        {
          ...notification,
          eventKey: `EUR:BUDGET:${budget.id}:2020-01-01`,
          status: 'SENT',
        },
        {
          ...notification,
          eventKey: `EUR:BUDGET:${MISSING_KEY}:${THIS_MONTH.start}`,
          status: 'PENDING',
        },
      ]);

      const deleted = await send('delete', `/dashboard/budgets/${budget.id}`, token);
      const statuses = await testDatabase.database
        .select({
          eventKey: proactiveNotifications.eventKey,
          status: proactiveNotifications.status,
        })
        .from(proactiveNotifications)
        .where(eq(proactiveNotifications.householdId, fixture.household.id));

      expect(deleted.status).toBe(204);
      expect(await storedBudget(budget.id)).toBeUndefined();
      expect(statuses).toEqual(
        expect.arrayContaining([
          { eventKey: `EUR:BUDGET:${budget.id}:${THIS_MONTH.start}`, status: 'SUPPRESSED' },
          { eventKey: `EUR:BUDGET:${budget.id}:2020-01-01`, status: 'SENT' },
          { eventKey: `EUR:BUDGET:${MISSING_KEY}:${THIS_MONTH.start}`, status: 'PENDING' },
        ]),
      );
    });

    it('keeps another household’s budget out of reach', async () => {
      const owner = await createHouseholdFixture(testDatabase.database, 'Budget Owner', 1);
      const intruder = await createHouseholdFixture(testDatabase.database, 'Budget Intruder', 1);
      const ownerToken = await tokenFor(owner);
      const intruderToken = await tokenFor(intruder);
      const { key } = savedSchema.parse(
        (await send('post', '/dashboard/budgets', ownerToken, budgetBody())).body,
      );
      const current = await view(budgetEditSchema, `/dashboard/budgets/${key}`, ownerToken);

      const attempts = [
        await send('get', `/dashboard/budgets/${key}`, intruderToken),
        await send(
          'patch',
          `/dashboard/budgets/${key}`,
          intruderToken,
          budgetBody({ version: current.version, limit: '1' }),
        ),
        await send('delete', `/dashboard/budgets/${key}`, intruderToken),
      ];

      expect(attempts.map((attempt) => attempt.status)).toEqual([404, 404, 404]);
      expect(await storedBudget(key)).toMatchObject({ limitMinor: 15000 });
    });
  });

  describe('goals', () => {
    function goalBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
      return {
        name: '  Lisbon trip ',
        type: 'TRAVEL',
        target: '2.000,00',
        saved: '',
        currency: 'EUR',
        targetDate: '',
        ...overrides,
      };
    }

    async function storedGoal(id: string): Promise<typeof goals.$inferSelect | undefined> {
      const [row] = await testDatabase.database.select().from(goals).where(eq(goals.id, id));
      return row;
    }

    it('creates a goal that the goals page then follows', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Saver', 1);
      const token = await tokenFor(fixture);

      const created = await send('post', '/dashboard/goals', token, goalBody());
      const { key } = savedSchema.parse(created.body);
      const page = await view(goalsSchema, '/dashboard/goals', token);

      expect(created.status).toBe(201);
      expect(await storedGoal(key)).toMatchObject({
        name: 'Lisbon trip',
        targetAmountMinor: 200000,
        currentAmountMinor: 0,
        targetDate: null,
        status: 'ACTIVE',
      });
      expect(page.options).toEqual({
        types: ['EMERGENCY_FUND', 'TRAVEL', 'PURCHASE', 'SAVINGS'],
        currencies: ['EUR'],
        defaultCurrency: 'EUR',
      });
      expect(page.currencies[0]?.goals).toEqual([
        expect.objectContaining({ key, goal: 'Lisbon trip' }),
      ]);
    });

    it.each([
      [{ name: '   ' }, [{ field: 'name', code: 'INVALID' }]],
      [{ target: '0' }, [{ field: 'target', code: 'INVALID_AMOUNT' }]],
      [{ saved: '-1' }, [{ field: 'saved', code: 'INVALID_AMOUNT' }]],
      [{ type: 'YACHT' }, [{ field: 'type', code: 'INVALID' }]],
      [{ currency: 'GBP' }, [{ field: 'currency', code: 'UNKNOWN' }]],
      [{ targetDate: 'soon' }, [{ field: 'targetDate', code: 'INVALID' }]],
    ])('explains which field is wrong in %j', async (change, errors) => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Dreamer', 1);
      const token = await tokenFor(fixture);

      const refused = await send('post', '/dashboard/goals', token, goalBody(change));

      expect(refused).toEqual({ status: 422, body: { errors } });
    });

    it('edits a goal, refuses an out-of-date copy and deletes it', async () => {
      const fixture = await createHouseholdFixture(testDatabase.database, 'Progress', 1);
      const token = await tokenFor(fixture);
      const { key } = savedSchema.parse(
        (await send('post', '/dashboard/goals', token, goalBody())).body,
      );
      const current = await view(goalEditSchema, `/dashboard/goals/${key}`, token);

      const saved = await send(
        'patch',
        `/dashboard/goals/${key}`,
        token,
        goalBody({ version: current.version, saved: '650,50', targetDate: '2027-06-30' }),
      );
      const stale = await send(
        'patch',
        `/dashboard/goals/${key}`,
        token,
        goalBody({ version: current.version, saved: '1' }),
      );
      const afterEdit = await storedGoal(key);
      const deleted = await send('delete', `/dashboard/goals/${key}`, token);

      expect(current).toMatchObject({
        key,
        name: 'Lisbon trip',
        type: 'TRAVEL',
        target: '2000.00',
        saved: '0.00',
        currency: 'EUR',
        targetDate: null,
      });
      expect(saved.status).toBe(200);
      expect(stale).toEqual({ status: 409, body: { code: 'STALE' } });
      expect(afterEdit).toMatchObject({ currentAmountMinor: 65050, targetDate: '2027-06-30' });
      expect(deleted.status).toBe(204);
      expect(await storedGoal(key)).toBeUndefined();
    });

    it('keeps another household’s goal out of reach', async () => {
      const owner = await createHouseholdFixture(testDatabase.database, 'Goal Owner', 1);
      const intruder = await createHouseholdFixture(testDatabase.database, 'Goal Intruder', 1);
      const ownerToken = await tokenFor(owner);
      const intruderToken = await tokenFor(intruder);
      const { key } = savedSchema.parse(
        (await send('post', '/dashboard/goals', ownerToken, goalBody())).body,
      );
      const current = await view(goalEditSchema, `/dashboard/goals/${key}`, ownerToken);

      const attempts = [
        await send('get', `/dashboard/goals/${key}`, intruderToken),
        await send(
          'patch',
          `/dashboard/goals/${key}`,
          intruderToken,
          goalBody({ version: current.version, name: 'Taken' }),
        ),
        await send('delete', `/dashboard/goals/${key}`, intruderToken),
      ];

      expect(attempts.map((attempt) => attempt.status)).toEqual([404, 404, 404]);
      expect(await storedGoal(key)).toMatchObject({ name: 'Lisbon trip' });
    });
  });
});
