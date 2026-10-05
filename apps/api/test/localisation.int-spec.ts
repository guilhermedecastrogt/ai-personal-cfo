import type { Server } from 'node:http';
import { Logger, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import { AI_PROVIDER } from '../src/ai/ai-provider.js';
import {
  FakeAIProvider,
  OTHER_INTERPRETATION,
  transactionInterpretation,
} from '../src/ai/testing/fake-ai-provider.fixture.js';
import { AppModule } from '../src/app.module.js';
import { AuthService } from '../src/auth/auth.service.js';
import { BudgetsRepository } from '../src/budgets/budgets.repository.js';
import { categories } from '../src/categories/categories.schema.js';
import { APP_CONFIG } from '../src/config/app-config.js';
import { FinancialAssistant } from '../src/conversation/financial-assistant.service.js';
import {
  sessionSchema,
  signalsSchema,
  spendingSchema,
} from '../src/dashboard/dashboard.contracts.js';
import { monthContaining } from '../src/finance/domain/period/period.js';
import { households } from '../src/households/households.schema.js';
import type { RequestContext } from '../src/households/request-context.js';
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
const SPACES = /\s/g;

describe('a household that uses Brazilian Portuguese', () => {
  let testDatabase: TestDatabase;
  let app: INestApplication<Server>;
  let ai: FakeAIProvider;
  let fixture: HouseholdFixture;
  let token: string;
  const categoryIds = new Map<string, string>();

  function contextOf(position = 0): RequestContext {
    const member = memberAt(fixture, position);
    return {
      householdId: fixture.household.id,
      memberId: member.id,
      memberName: member.name,
      channel: 'whatsapp',
      locale: 'pt-BR',
    };
  }

  async function view<Schema extends { parse(value: unknown): unknown }>(
    schema: Schema,
    path: string,
  ): Promise<ReturnType<Schema['parse']>> {
    const response = await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    return schema.parse(response.body) as ReturnType<Schema['parse']>;
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
    for (const row of await testDatabase.database.select().from(categories)) {
      categoryIds.set(row.name, row.id);
    }
    fixture = await createHouseholdFixture(testDatabase.database, 'Casa', 2);
    await testDatabase.database
      .update(households)
      .set({ locale: 'pt-BR' })
      .where(eq(households.id, fixture.household.id));
    await testDatabase.database.insert(transactions).values({
      householdId: fixture.household.id,
      memberId: memberAt(fixture, 0).id,
      accountId: fixture.jointAccount.id,
      type: 'EXPENSE',
      currency: 'EUR',
      amountMinor: 182698,
      merchant: 'Landlord',
      categoryId: categoryIds.get('Restaurants') ?? null,
      transactionDate: THIS_MONTH.start,
      source: 'MANUAL',
    });
    await app.get(BudgetsRepository).create(fixture.household.id, {
      categoryId: categoryIds.get('Restaurants') ?? '',
      period: 'MONTHLY',
      limitMinor: 15000,
      currency: 'EUR',
      startsOn: '2020-01-01',
    });
    const auth = app.get(AuthService);
    const code = await auth.issueAccessCode(fixture.household.id, memberAt(fixture, 0).id);
    token = (await auth.signIn(code, new Date()))?.token ?? '';
  });

  beforeEach(() => {
    ai.interpretationRequests.length = 0;
    ai.replyRequests.length = 0;
  });

  afterAll(async () => {
    await app.close();
    await testDatabase.destroy();
  });

  describe('dashboard', () => {
    it('reports its language and names months in Portuguese', async () => {
      const session = await view(sessionSchema, '/dashboard/session');

      expect(session.locale).toBe('pt-BR');
      expect(session.months[0]?.label).toMatch(/^[A-ZÇ][a-zç]+ de \d{4}$/);
    });

    it('shows categories with Portuguese names and amounts in Portuguese format', async () => {
      const spending = await view(spendingSchema, '/dashboard/spending');
      const [eur] = spending.currencies;

      expect(eur?.total.text.replace(SPACES, ' ')).toBe('€ 1.826,98');
      expect(JSON.stringify(eur)).toContain('Restaurantes');
      expect(JSON.stringify(eur)).not.toContain('"Restaurants"');
    });

    it('describes signals in Portuguese', async () => {
      const signals = await view(signalsSchema, '/dashboard/signals');

      expect(signals.currencies[0]?.insights.map((insight) => insight.title)).toContain(
        'Orçamento de Restaurantes ultrapassado',
      );
    });

    it('leaves a household without a language in English', async () => {
      const other = await createHouseholdFixture(testDatabase.database, 'House', 1);
      const auth = app.get(AuthService);
      const code = await auth.issueAccessCode(other.household.id, memberAt(other, 0).id);
      const otherToken = (await auth.signIn(code, new Date()))?.token ?? '';

      const response = await request(app.getHttpServer())
        .get('/dashboard/session')
        .set('Authorization', `Bearer ${otherToken}`);

      expect(sessionSchema.parse(response.body)).toMatchObject({ locale: 'en' });
      expect(sessionSchema.parse(response.body).months[0]?.label).toMatch(/^[A-Z][a-z]+ \d{4}$/);
    });
  });

  describe('WhatsApp', () => {
    it('offers the model Portuguese category names and records the one it picks', async () => {
      ai.willInterpretAs(
        transactionInterpretation({ category: 'Mercado', merchant: 'Tesco', amount: '23' }),
      );

      const response = await app
        .get(FinancialAssistant)
        .handle(contextOf(), { text: 'Gastei 23 euros no Tesco' }, new Date());

      const names = ai.interpretationRequests[0]?.categories.map((option) => option.name) ?? [];
      expect(names).toEqual(expect.arrayContaining(['Mercado', 'Restaurantes', 'Salário']));
      expect(names).not.toContain('Groceries');
      expect(response.outcome).toMatchObject({
        kind: 'TRANSACTION',
        extraction: { status: 'RECORDED' },
      });
      const [recorded] = await testDatabase.database
        .select()
        .from(transactions)
        .where(eq(transactions.merchant, 'Tesco'));
      expect(recorded?.categoryId).toBe(categoryIds.get('Groceries'));
      expect(ai.replyRequests.at(-1)).toMatchObject({
        locale: 'pt-BR',
        facts: { category: 'Mercado' },
      });
      expect(String(ai.replyRequests.at(-1)?.facts.amount).replace(SPACES, ' ')).toBe('€ 23,00');
    });

    it('falls back to Portuguese when the model cannot write the reply', async () => {
      ai.willInterpretAs(OTHER_INTERPRETATION);
      ai.willFailToReply('UNAVAILABLE');

      const response = await app
        .get(FinancialAssistant)
        .handle(contextOf(1), { text: 'Oi' }, new Date());

      expect(response.reply).toContain('Seja bem-vindo.');
      ai.willReply((replyRequest) => `[${replyRequest.situation}]`);
    });

    it('says it is unavailable in Portuguese when the model cannot interpret', async () => {
      ai.willFailToInterpret('UNAVAILABLE');

      const response = await app
        .get(FinancialAssistant)
        .handle(contextOf(), { text: 'Quanto gastamos?' }, new Date());

      expect(response.reply).toBe(
        'Não consegui processar isso agora. Nada foi registrado. Tente novamente em instantes.',
      );
    });
  });
});
