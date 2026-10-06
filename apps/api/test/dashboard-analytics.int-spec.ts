import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { z } from 'zod';
import { AccountsRepository } from '../src/accounts/accounts.repository.js';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import { FakeAIProvider } from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { categories } from '../src/categories/categories.schema.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import {
  budgetsSchema,
  compareSchema,
  evolutionSchema,
  memberSchema,
  membersSchema,
  spendingSchema,
  transactionsSchema,
} from '../src/dashboard/dashboard.contracts.js';
import { monthContaining, previousPeriod } from '../src/finance/domain/period/period.js';
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
const LAST_MONTH = previousPeriod('MONTHLY', THIS_MONTH);
const MISSING_KEY = '7f1c2a9e-3b4d-4e5f-8a6b-1c2d3e4f5a6b';

describe('dashboard analytics', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let auth: AuthService;
  let fixture: HouseholdFixture;
  let token: string;
  const categoryIds = new Map<string, string>();

  function category(name: string): string {
    return categoryIds.get(name) ?? '';
  }

  async function tokenFor(household: HouseholdFixture): Promise<string> {
    const code = await auth.issueAccessCode(household.household.id, memberAt(household, 0).id);
    const response = await request(app.getHttpServer())
      .post('/auth/sessions')
      .send({ accessCode: code });
    return (response.body as { token: string }).token;
  }

  async function get(path: string, bearer = token): Promise<request.Response> {
    return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${bearer}`);
  }

  async function view<Schema extends z.ZodType>(
    schema: Schema,
    path: string,
  ): Promise<z.output<Schema>> {
    const response = await get(path);
    expect(response.status).toBe(200);
    expect(schema.parse(response.body)).toEqual(response.body);
    return response.body as z.output<Schema>;
  }

  async function record(
    household: HouseholdFixture,
    memberPosition: number,
    rows: readonly (Partial<typeof transactions.$inferInsert> & { amountMinor: number })[],
  ): Promise<void> {
    await testDatabase.database.insert(transactions).values(
      rows.map((row) => ({
        householdId: household.household.id,
        memberId: memberAt(household, memberPosition).id,
        accountId: household.jointAccount.id,
        type: 'EXPENSE' as const,
        currency: 'EUR',
        transactionDate: THIS_MONTH.start,
        source: 'MANUAL' as const,
        ...row,
      })),
    );
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
    fixture = await createHouseholdFixture(testDatabase.database, 'Analytics', 2);
    await record(fixture, 0, [
      {
        amountMinor: 300000,
        type: 'INCOME',
        categoryId: category('Salary'),
        transactionDate: LAST_MONTH.start,
      },
      { amountMinor: 300000, type: 'INCOME', categoryId: category('Salary') },
      {
        amountMinor: 20000,
        categoryId: category('Groceries'),
        merchant: 'Lidl',
        transactionDate: LAST_MONTH.start,
      },
      { amountMinor: 24000, categoryId: category('Groceries'), merchant: 'Lidl' },
      { amountMinor: 5000, categoryId: category('Uber'), merchant: 'Uber' },
    ]);
    await record(fixture, 1, [
      { amountMinor: 18000, categoryId: category('Restaurants'), merchant: 'Five Guys 100%_off' },
    ]);
    await app.get(BudgetsRepository).create(fixture.household.id, {
      categoryId: category('Food'),
      period: 'MONTHLY',
      limitMinor: 50000,
      currency: 'EUR',
      startsOn: '2020-01-01',
    });
    token = await tokenFor(fixture);
  });

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  it('draws six months of income and spending, scaled to the largest month', async () => {
    const evolution = await view(evolutionSchema, '/dashboard/evolution');
    const [eur] = evolution.currencies;
    const months = eur?.months ?? [];

    expect(evolution.months).toBe(6);
    expect(months).toHaveLength(6);
    expect(months.at(-1)).toMatchObject({
      key: THIS_MONTH.start.slice(0, 7),
      income: { minor: 300000 },
      expenses: { minor: 47000 },
      net: { minor: 253000 },
      incomeBar: { basisPoints: 10000 },
      expensesBar: { basisPoints: 1567 },
    });
    expect(months.at(-2)).toMatchObject({ expenses: { minor: 20000 } });
    expect((await view(evolutionSchema, '/dashboard/evolution?months=12')).months).toBe(12);
    expect((await get('/dashboard/evolution?months=7')).status).toBe(400);
  });

  it('shows how spending splits across top-level categories, ready for a ring chart', async () => {
    const spending = await view(spendingSchema, '/dashboard/spending');

    expect(spending.currencies[0]?.composition).toEqual([
      expect.objectContaining({
        category: 'Food',
        share: expect.objectContaining({ basisPoints: 8936 }) as unknown,
        offset: expect.objectContaining({ basisPoints: 0 }) as unknown,
      }),
      expect.objectContaining({
        category: 'Transport',
        offset: expect.objectContaining({ basisPoints: 8936 }) as unknown,
      }),
    ]);
  });

  it('gives each budget its pace through the period', async () => {
    const budgets = await view(budgetsSchema, '/dashboard/budgets');

    expect(budgets.currencies[0]?.budgets[0]?.pace).toMatchObject({
      elapsed: expect.objectContaining({ basisPoints: expect.any(Number) as unknown }) as unknown,
      status: expect.stringMatching(/FASTER|ON_PACE|SLOWER/) as unknown,
    });
  });

  it('compares two months, total and by category', async () => {
    const comparison = await view(compareSchema, '/dashboard/compare');
    const [eur] = comparison.currencies;

    expect(comparison.second.key).toBe(THIS_MONTH.start.slice(0, 7));
    expect(comparison.first.key).toBe(LAST_MONTH.start.slice(0, 7));
    expect(eur?.expenses).toMatchObject({
      current: { minor: 47000 },
      previous: { minor: 20000 },
      direction: 'INCREASE',
    });
    expect(eur?.categories[0]).toMatchObject({
      category: 'Food',
      first: { minor: 20000 },
      second: { minor: 42000 },
      secondBar: { basisPoints: 10000 },
    });
    expect((await get('/dashboard/compare?a=2099-01')).status).toBe(400);
  });

  it('shows one member’s month and refuses a member from another household', async () => {
    const other = await createHouseholdFixture(testDatabase.database, 'Analytics Other', 1);
    const members = await view(membersSchema, '/dashboard/members');
    const second = members.members[1];
    if (second === undefined) {
      throw new Error('expected two members');
    }

    const member = await view(memberSchema, `/dashboard/members/${second.key}`);

    expect(member.member).toEqual(second);
    expect(member.currencies[0]).toMatchObject({
      spending: { minor: 18000 },
      householdSpending: { minor: 47000 },
      shareOfHousehold: { basisPoints: 3830 },
      composition: [expect.objectContaining({ category: 'Food' })],
    });
    expect((await get(`/dashboard/members/${memberAt(other, 0).id}`)).status).toBe(404);
    expect((await get(`/dashboard/members/${MISSING_KEY}`)).status).toBe(404);
  });

  it('searches text literally, over a free range, in the order asked', async () => {
    const percent = await view(
      transactionsSchema,
      `/dashboard/transactions?q=${encodeURIComponent('100%_')}`,
    );
    const wildcard = await view(
      transactionsSchema,
      `/dashboard/transactions?q=${encodeURIComponent('%')}`,
    );
    const range = await view(
      transactionsSchema,
      `/dashboard/transactions?from=${LAST_MONTH.start}&to=${THIS_MONTH.end}&sort=amount_asc`,
    );

    expect(percent.transactions.map((row) => row.merchant)).toEqual(['Five Guys 100%_off']);
    expect(wildcard.transactions).toHaveLength(1);
    expect(range.range).toEqual({ start: LAST_MONTH.start, end: THIS_MONTH.end });
    expect(range.total).toBe(6);
    expect(range.transactions.map((row) => row.amount.minor)).toEqual([
      5000, 18000, 20000, 24000, 300000, 300000,
    ]);
    expect(
      (await get(`/dashboard/transactions?from=${THIS_MONTH.end}&to=${LAST_MONTH.start}`)).status,
    ).toBe(400);
    expect((await get('/dashboard/transactions?from=2020-01-01&to=2026-01-01')).status).toBe(400);
  });

  it('exports the filtered transactions as a spreadsheet file, without formulas', async () => {
    await record(fixture, 0, [{ amountMinor: 100, merchant: '=cmd|calc' }]);
    const other = await createHouseholdFixture(testDatabase.database, 'Export Other', 1);
    await record(other, 0, [{ amountMinor: 999, merchant: 'Secret Shop' }]);

    const response = await get('/dashboard/transactions/export');
    const text = response.text;

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/csv/);
    expect(response.headers['content-disposition']).toMatch(/attachment; filename="transactions-/);
    expect(text.startsWith('﻿Date,Type,Amount')).toBe(true);
    expect(text).toContain("'=cmd|calc");
    expect(text).toContain('240.00');
    expect(text).not.toContain('Secret Shop');
    expect((await get('/dashboard/transactions/export?q=lidl')).text.split('\r\n')).toHaveLength(3);
    expect((await request(app.getHttpServer()).get('/dashboard/transactions/export')).status).toBe(
      401,
    );
  });

  it('keeps an account in another currency apart in every chart', async () => {
    const real = await app.get(AccountsRepository).create(fixture.household.id, {
      name: 'Conta Real',
      type: 'BANK',
      currency: 'BRL',
    });
    await record(fixture, 0, [
      { amountMinor: 9900, currency: 'BRL', accountId: real.id, categoryId: category('Groceries') },
    ]);

    const evolution = await view(evolutionSchema, '/dashboard/evolution');

    expect(evolution.currencies.map((entry) => entry.currency)).toEqual(['EUR', 'BRL']);
    expect(evolution.currencies[1]?.months.at(-1)).toMatchObject({
      expenses: { minor: 9900 },
      expensesBar: { basisPoints: 10000 },
    });
  });
});
